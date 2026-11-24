"""Reliability tests use the same isolated loopback service as the V3.4 suite."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date, timedelta
from unittest import TestCase
from unittest.mock import Mock, patch

from psycopg import errors

from garmin_coverage import ARCHIVE_LOCK, LOCK, daily_import, record, repair_plan, schema_version, writer
from sync_garmin import import_activities
from test_intelligence import ALLOWED, DENIED, ROOT, apply, claim, connect, rpc
from tools.staging_fixture import LOCAL_DB, fixture_sql

UPGRADE_DB = "gch_v341_upgrade"
MIGRATION = "supabase/migrations/0035_staging_reliability.sql"
REFERENCE = date(2024, 3, 5)
DAY = date(2025, 2, 1)
NEXT = DAY + timedelta(days=1)
TODAY = NEXT + timedelta(days=1)
ID = 9007199254800000


def sample(identifier=ID, day=DAY, distance=10000):
    return {"activityId": identifier, "startTimeLocal": f"{day}T09:00:00", "activityType": "running",
            "distance": distance, "duration": 2400}


def activity_client(*rows):
    garmin = Mock()
    garmin.search_activities.return_value = list(rows)
    garmin.get_activity.return_value = {"summaryDTO": {"averagePower": 222}}
    return garmin


def reconcile(conn, garmin, start=DAY, end=DAY):
    return import_activities(conn, schema_version(conn), garmin, start, end, TODAY)


def result(conn, day=DAY, source="activities"):
    return conn.execute("""
        SELECT attempt_state, evidence, reconciliation, observed_count, missing_count
        FROM coaching.import_coverage WHERE day=%s AND source=%s
        """, (day, source)).fetchone()


class Reliability(TestCase):
    @classmethod
    def setUpClass(cls):
        for db in (LOCAL_DB, UPGRADE_DB):
            with connect(db) as conn:
                if conn.execute("SELECT to_regnamespace('coaching')").fetchone()[0] is not None:
                    raise ValueError("Usare database di test vuoti")
                for path in ("tests/sql/auth_stub.sql", "supabase/bootstrap.sql", "supabase/dashboard.sql"):
                    apply(conn, path)
                conn.execute("INSERT INTO dashboard_private.allowed_users(user_id) VALUES (%s)", (ALLOWED,))
                legacy = db == UPGRADE_DB
                if legacy:
                    # Same deterministic generator, with the dedicated upgrade DB guard.
                    conn.execute(fixture_sql(REFERENCE, False, legacy=True).replace(LOCAL_DB, UPGRADE_DB))
                    source = (ROOT / MIGRATION).read_text(encoding="utf-8")
                    with cls._db_error(conn, errors.RaiseException):
                        conn.execute(source)
                    claim(conn, ALLOWED)
                    cls.legacy = conn.execute("SELECT public.dashboard_data()").fetchone()[0]
                    conn.execute("RESET ROLE")
                apply(conn, "supabase/migrations/0034_data_intelligence.sql")
                if legacy:
                    record(conn, REFERENCE, "activities", "success_with_data", 1)
                    broken = source.replace("COMMIT;", "SELECT 1/0; COMMIT;")
                    with cls._db_error(conn, errors.DivisionByZero):
                        conn.execute(broken)
                    absent = conn.execute("""SELECT count(*) FROM information_schema.columns
                        WHERE table_schema='coaching' AND table_name='import_coverage'
                          AND column_name = 'reconciliation'""").fetchone()[0]
                    if absent:
                        raise AssertionError("La migrazione fallita ha lasciato modifiche")
                apply(conn, MIGRATION)
                apply(conn, MIGRATION)
                if not legacy:
                    conn.execute(fixture_sql(REFERENCE, True))

    @staticmethod
    @contextmanager
    def _db_error(conn, kind):
        try:
            yield
        except kind:
            conn.execute("ROLLBACK")
        else:
            raise AssertionError(f"Atteso {kind.__name__}")

    def test_upgrade_preserves_legacy_and_historical_row(self):
        with connect(UPGRADE_DB) as conn:
            self.assertEqual(schema_version(conn), 34)
            self.assertEqual(result(conn, REFERENCE), ("success_with_data", "success_with_data", None, None, None))
            self.assertIn((REFERENCE, "activities"), repair_plan(conn, REFERENCE, REFERENCE))
            claim(conn, ALLOWED)
            self.assertEqual(conn.execute("SELECT public.dashboard_data()").fetchone()[0], self.legacy)
            self.assertEqual(rpc(conn, "metadata")["reliability_version"], 1)

    def test_fixture_acl_rpc_counts_and_cursor(self):
        with connect(LOCAL_DB) as conn:
            with self.assertRaises(errors.RaiseException):
                conn.execute(fixture_sql(REFERENCE, True))
            conn.execute("ROLLBACK")
            claim(conn, DENIED)
            with self.assertRaises(errors.InsufficientPrivilege):
                rpc(conn, "metadata")
            conn.execute("RESET ROLE")
            conn.execute("SET ROLE anon")
            with self.assertRaises(errors.InsufficientPrivilege):
                rpc(conn, "metadata")
            conn.execute("RESET ROLE")
            claim(conn, ALLOWED)
            with self.assertRaises(errors.InsufficientPrivilege):
                conn.execute("SELECT reconciliation FROM coaching.import_coverage")
            meta = rpc(conn, "metadata")
            self.assertEqual([meta[kind]["count"] for kind in ("activities","daily","coverage")], [2502,2501,6])
            for kind in ("activities", "daily", "coverage"):
                cursor, total = [], 0
                limit = 3 if kind == "coverage" else 250
                while True:
                    page = rpc(conn, kind, "2000-01-01", REFERENCE, meta["revision"], limit, *cursor)
                    total += page["count"]
                    if not page["has_more"]:
                        break
                    cursor = [page["next_cursor"]["date"]]
                    if kind != "daily":
                        cursor.append(page["next_cursor"]["key"])
                self.assertEqual(total, meta[kind]["count"])

    def test_failed_commit_rolls_back_archive_and_attestation(self):
        with connect(LOCAL_DB) as conn:
            conn.execute("""
                CREATE FUNCTION coaching.reject_v341_import() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                  IF NEW.activity_id=9007199254800000 THEN
                    RAISE EXCEPTION 'Synthetic failed commit' USING ERRCODE='23514';
                  END IF;
                  RETURN NEW;
                END $$;
                CREATE CONSTRAINT TRIGGER reject_v341_import
                  AFTER INSERT ON coaching.garmin_activities DEFERRABLE INITIALLY DEFERRED
                  FOR EACH ROW EXECUTE FUNCTION coaching.reject_v341_import();
            """)
            try:
                with self.assertRaises(errors.CheckViolation):
                    reconcile(conn, activity_client(sample()))
                self.assertEqual(result(conn), ("failed", None, None, None, None))
                self.assertFalse(conn.execute("SELECT EXISTS(SELECT FROM coaching.garmin_activities WHERE activity_id=%s)",
                                              (ID,)).fetchone()[0])
            finally:
                conn.execute("DELETE FROM coaching.import_coverage WHERE day=%s", (DAY,))
                conn.execute("DROP TRIGGER reject_v341_import ON coaching.garmin_activities")
                conn.execute("DROP FUNCTION coaching.reject_v341_import()")

    def test_same_count_replacement_empty_and_retry(self):
        garmin = activity_client(sample())
        with connect(LOCAL_DB) as conn, conn.transaction(force_rollback=True):
            self.assertEqual(reconcile(conn, garmin)[DAY].inserted, 1)
            self.assertEqual(result(conn)[2:], ("verified", 1, 0))
            garmin.search_activities.return_value = [sample(ID + 1)]
            self.assertEqual(reconcile(conn, garmin)[DAY].status, "conflict")
            self.assertEqual(result(conn)[2:], ("conflict", 1, 1))
            self.assertIn((DAY, "activities"), repair_plan(conn, DAY, DAY))
            garmin.search_activities.return_value = []
            self.assertEqual(reconcile(conn, garmin)[DAY].missing, 2)
            self.assertEqual(result(conn), ("success_empty", "success_empty", "conflict", 0, 2))
            self.assertEqual(conn.execute("SELECT count(*) FROM coaching.garmin_activities WHERE activity_date=%s",
                                          (DAY,)).fetchone()[0], 2)
            self.assertEqual(reconcile(conn, garmin, NEXT, NEXT)[NEXT].status, "success")
            self.assertEqual(result(conn, NEXT)[2:], ("verified", 0, 0))
            garmin.search_activities.side_effect = RuntimeError("synthetic")
            with self.assertRaises(RuntimeError):
                reconcile(conn, garmin, NEXT, NEXT)
            self.assertEqual(result(conn, NEXT), ("failed", "success_empty", "verified", 0, 0))
            self.assertIn((NEXT, "activities"), repair_plan(conn, NEXT, NEXT))

    def test_move_preservation_and_incomplete_detail(self):
        garmin = activity_client(sample())
        with connect(LOCAL_DB) as conn, conn.transaction(force_rollback=True):
            reconcile(conn, garmin, DAY, NEXT)
            garmin.search_activities.return_value = [sample(day=NEXT, distance=None)]
            self.assertEqual(reconcile(conn, garmin, DAY, NEXT)[NEXT].moved, 1)
            self.assertEqual(result(conn)[2], "invalidated")
            self.assertEqual(result(conn, NEXT)[2], "invalidated")
            self.assertEqual(conn.execute("""SELECT activity_date,raw_data#>>'{summary,distance}'
                FROM coaching.garmin_activities WHERE activity_id=%s""", (ID,)).fetchone(), (NEXT, "10000"))
            garmin.search_activities.return_value += [sample(ID + 1, NEXT)]
            garmin.get_activity.side_effect = [{"synthetic": True}, {}]
            with self.assertRaises(ValueError):
                reconcile(conn, garmin, NEXT, NEXT)
            self.assertEqual(result(conn, NEXT)[0], "failed")
            self.assertFalse(conn.execute("SELECT EXISTS(SELECT FROM coaching.garmin_activities WHERE activity_id=%s)",
                                          (ID + 1,)).fetchone()[0])

    def test_legacy_update_delete_insert_and_truncate_invalidate(self):
        with connect(LOCAL_DB) as conn, conn.transaction(force_rollback=True):
            garmin = activity_client(sample())
            reconcile(conn, garmin, DAY, NEXT)
            for mutation in (
                "UPDATE coaching.garmin_activities SET raw_data='{}' WHERE activity_id=9007199254800000",
                "DELETE FROM coaching.garmin_activities WHERE activity_id=9007199254800000",
                "TRUNCATE coaching.garmin_activities",
            ):
                with conn.transaction(force_rollback=True):
                    conn.execute(mutation)
                    self.assertEqual(result(conn)[2], "invalidated")
            conn.execute("""INSERT INTO coaching.garmin_activities(activity_id,activity_date,raw_data) VALUES
                (9007199254800001,'2025-02-02','{}')""")
            self.assertEqual(result(conn, NEXT)[2], "invalidated")
            reconcile(conn, garmin)
            record(conn, DAY, "activities", "success_with_data", 1)  # V3.4 writer
            self.assertIsNone(result(conn)[2])

    def test_minimum_writer_and_v33_no_coverage_grants(self):
        with connect(LOCAL_DB) as conn, conn.transaction(force_rollback=True):
            conn.execute("""
                CREATE ROLE v341_writer NOLOGIN;
                CREATE ROLE v341_legacy NOLOGIN;
                GRANT USAGE ON SCHEMA coaching TO v341_writer, v341_legacy;
                GRANT SELECT, INSERT, UPDATE ON coaching.garmin_activities, coaching.garmin_daily_metrics
                  TO v341_writer, v341_legacy;
                GRANT SELECT, INSERT, UPDATE ON coaching.import_coverage TO v341_writer;
                GRANT SELECT ON coaching.intelligence_state TO v341_writer;
            """)
            conn.execute("SET LOCAL ROLE v341_writer")
            garmin = activity_client(sample())
            self.assertEqual(reconcile(conn, garmin)[DAY].status, "success")
            garmin.get_daily_sleep.return_value = {"sleepTimeSeconds": 30000}
            garmin.get_daily_stress.return_value = [{"values": {"overallStressLevel": 0}}]
            self.assertTrue(daily_import(conn, 34, garmin, DAY, "sleep", TODAY))
            self.assertTrue(daily_import(conn, 34, garmin, DAY, "stress", TODAY))
            garmin.get_daily_hrv.return_value = None
            self.assertEqual(daily_import(conn, 34, garmin, DAY, "hrv", TODAY).status, "no_measurement")
            garmin.get_daily_hrv.return_value = "malformed"
            self.assertEqual(daily_import(conn, 34, garmin, DAY, "hrv", TODAY).status, "failed")
            conn.execute("SET LOCAL ROLE v341_legacy")
            conn.execute("UPDATE coaching.garmin_daily_metrics SET sleep_data=NULL WHERE metric_date=%s", (DAY,))
            conn.execute("UPDATE coaching.garmin_activities SET activity_date=%s WHERE activity_id=%s", (NEXT, ID))
            conn.execute("RESET ROLE")
            self.assertEqual(result(conn)[2], "invalidated")
            self.assertEqual(result(conn, DAY, "sleep")[2], "invalidated")
            self.assertEqual(result(conn, DAY, "stress")[2], "verified")

    def test_crash_lock_release_and_concurrency(self):
        with connect(LOCAL_DB) as first, connect(LOCAL_DB) as other:
            first.execute("SELECT pg_advisory_lock(%s)", (LOCK,))
            with patch("garmin_coverage.psycopg.connect", return_value=other):
                with self.assertRaisesRegex(RuntimeError, "già in corso"), writer("synthetic"):
                    pass
            first.execute("SELECT pg_advisory_unlock(%s)", (LOCK,))
        with connect(LOCAL_DB) as first, patch("garmin_coverage.psycopg.connect", return_value=first):
            with self.assertRaisesRegex(RuntimeError, "synthetic"), writer("synthetic"):
                raise RuntimeError("synthetic")
        with connect(LOCAL_DB) as first:
            self.assertTrue(first.execute("SELECT pg_try_advisory_lock(%s)", (LOCK,)).fetchone()[0])
            garmin = activity_client(sample())
            reconcile(first, garmin)
            garmin.search_activities.side_effect = KeyboardInterrupt()
            with self.assertRaises(KeyboardInterrupt):
                reconcile(first, garmin)
            self.assertEqual(result(first)[:3], ("partial", "success_with_data", "verified"))
            with first.transaction():
                first.execute("SELECT pg_advisory_xact_lock(%s)", (ARCHIVE_LOCK,))

                def mutate():
                    with connect(LOCAL_DB) as other:
                        other.execute("SET lock_timeout='300ms'")
                        with self.assertRaises(errors.LockNotAvailable):
                            other.execute("UPDATE coaching.garmin_activities SET raw_data='{}' WHERE activity_id=%s", (ID,))

                with ThreadPoolExecutor(max_workers=1) as executor:
                    executor.submit(mutate).result(timeout=5)
            with first.transaction(force_rollback=True):
                first.execute("UPDATE coaching.garmin_activities SET raw_data='{}' WHERE activity_id=%s", (ID,))
                self.assertEqual(result(first)[2], "invalidated")
            self.assertEqual(result(first)[2], "verified")
            # Leave the fixture ready for the backup/restore check.
            first.execute("DELETE FROM coaching.garmin_activities WHERE activity_id=%s", (ID,))
            first.execute("DELETE FROM coaching.import_coverage WHERE day=%s", (DAY,))
