"""Run against two empty databases on a dedicated loopback PostgreSQL service."""
import os
from pathlib import Path
from datetime import date
from unittest.mock import Mock
import unittest

import psycopg
from psycopg import errors
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from garmin_coverage import daily_import, repair_plan, legacy_plan, schema_version
from sync_garmin import import_activities

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/0034_data_intelligence.sql"
ALLOWED = "00000000-0000-0000-0000-000000000001"
DENIED = "00000000-0000-0000-0000-000000000002"


def connect(name):
    options = conninfo_to_dict(os.environ["V34_TEST_DSN"])
    if options.get("host") != "127.0.0.1" or options.get("hostaddr", "127.0.0.1") != "127.0.0.1" or "service" in options:
        raise ValueError("V34_TEST_DSN must target the isolated loopback server")
    return psycopg.connect(make_conninfo(**(options | {"dbname": name})), autocommit=True)


def apply(conn, relative):
    script = (ROOT / relative).read_text(encoding="utf-8")
    conn.execute(script)


def rpc(conn, kind, *args):
    name = "dashboard_" + kind + "_v2"
    args = tuple(item.isoformat() if isinstance(item, date) else item for item in args)
    return conn.execute(f"SELECT public.{name}({','.join(['%s'] * len(args))})", args).fetchone()[0]


def claim(conn, user):
    conn.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (user,))
    conn.execute("SET ROLE authenticated")


class Intelligence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for name in ("v34_fresh", "v34_upgrade"):
            with connect(name) as conn:
                if conn.execute("SELECT to_regnamespace('coaching')").fetchone()[0] is not None:
                    raise ValueError("Use empty synthetic databases")
                apply(conn, "tests/sql/auth_stub.sql")
                apply(conn, "supabase/bootstrap.sql")
                apply(conn, "supabase/dashboard.sql")
                conn.execute("INSERT INTO dashboard_private.allowed_users(user_id) VALUES (%s)", (ALLOWED,))
                if name == "v34_upgrade":
                    conn.execute("""
                        INSERT INTO coaching.garmin_activities(activity_id,activity_date,activity_type,raw_data)
                        SELECT 9007199254740992 + i, DATE '2024-01-01'+(i/2),'running',
                            '{"summary":{"distance":1000,"duration":600,"averageHR":150,"elevationGain":0,"averageRunningCadenceInStepsPerMinute":167,"fastestSplit_1000":240,"hrTimeInZone_2":0,"private":"synthetic"},"detail":{"summaryDTO":{"averagePower":230,"averageTemperature":-4,"elevationLoss":12},"coordinates":["synthetic"]}}'
                        FROM generate_series(0,2500) i;
                        INSERT INTO coaching.garmin_activities(activity_id,activity_date,raw_data)
                        VALUES (-1,'2024-01-01','{}'),(1,NULL,'{}');
                        INSERT INTO coaching.garmin_daily_metrics(metric_date)
                        SELECT DATE '2024-01-01'+i FROM generate_series(0,2500) i;
                    """)
                    claim(conn, ALLOWED)
                    cls.before = conn.execute("SELECT public.dashboard_data()").fetchone()[0]
                    conn.execute("RESET ROLE")
                apply(conn, MIGRATION)
                apply(conn, MIGRATION)

    def test_atomic_writer_failures_resume_and_previous_values(self):
        today = date(2025, 2, 3)
        first = date(2025, 2, 1)
        second = date(2025, 2, 2)
        garmin = Mock()
        garmin.search_activities.return_value = []
        with connect("v34_fresh") as conn, conn.transaction(force_rollback=True):
            self.assertEqual(schema_version(conn), 34)
            import_activities(conn, 34, garmin, first, today, today)
            self.assertEqual(conn.execute(
                "SELECT day, attempt_state, item_count FROM coaching.import_coverage ORDER BY day").fetchall(),
                [(first,"success_empty",0), (second,"success_empty",0), (today,"partial",None)])
            self.assertIn((today,"activities"), repair_plan(conn, first, today))
            self.assertNotIn((first,"activities"), repair_plan(conn, first, today))
            garmin.search_activities.return_value = [
                {"activityId": 42, "startTimeLocal": "2025-02-01T15:00:00", "activityType": "running", "distance": 8000},
                {"activityId": 43, "startTimeLocal": "2025-02-01T18:00:00", "activityType": "running"},
            ]
            garmin.get_activity.return_value = {"synthetic": True}
            import_activities(conn, 34, garmin, first, first, today)
            garmin.search_activities.return_value[0]["distance"] = None
            import_activities(conn, 34, garmin, first, first, today)
            self.assertEqual(conn.execute(
                "SELECT raw_data#>>'{summary,distance}' FROM coaching.garmin_activities WHERE activity_id=42").fetchone()[0], "8000")
            self.assertEqual(conn.execute("SELECT count(*) FROM coaching.garmin_activities").fetchone()[0], 2)
            bad = RuntimeError()
            bad.status_code = 403
            garmin.get_daily_hrv.side_effect = bad
            self.assertFalse(daily_import(conn, 34, garmin, first, "hrv", today))
            self.assertEqual(conn.execute("SELECT error_code FROM coaching.import_coverage WHERE source='hrv'").fetchone(), ("http_403",))
            garmin.get_daily_body_battery.return_value = [{"charged":12,"drained":30}]
            self.assertTrue(daily_import(conn, 34, garmin, first, "body_battery", today))
            garmin.get_daily_body_battery.return_value = [{"charged":22,"drained":None}]
            self.assertFalse(daily_import(conn, 34, garmin, first, "body_battery", today))
            self.assertEqual(conn.execute("SELECT body_battery_data FROM coaching.garmin_daily_metrics").fetchone()[0],
                             [{"charged":22,"drained":30}])
            self.assertEqual(conn.execute("SELECT attempt_state,evidence FROM coaching.import_coverage WHERE source='body_battery'").fetchone(),
                             ("partial","success_with_data"))
            garmin.get_daily_body_battery.return_value = None
            self.assertFalse(daily_import(conn, 34, garmin, first, "body_battery", today))
            self.assertEqual(conn.execute("SELECT body_battery_data FROM coaching.garmin_daily_metrics").fetchone()[0],
                             [{"charged":22,"drained":30}])
            self.assertIn((first,"body_battery"), repair_plan(conn, first, today))
            self.assertNotIn((first,"body_battery"), legacy_plan(conn, first, today))
            self.assertIn((first,"sleep"), legacy_plan(conn, first, today))

    def test_commit_failure_does_not_attest_saved_data(self):
        day = date(2025, 4, 1)
        garmin = Mock()
        garmin.get_daily_sleep.return_value = {"sleepTimeSeconds":30000}
        with connect("v34_fresh") as conn:
            conn.execute("""
                CREATE OR REPLACE FUNCTION coaching.reject_fixture_sleep() RETURNS trigger LANGUAGE plpgsql AS $fixture$
                BEGIN
                  RAISE EXCEPTION 'Synthetic deferred failure' USING ERRCODE = '23514';
                END $fixture$;
                CREATE CONSTRAINT TRIGGER reject_fixture_sleep AFTER INSERT ON coaching.garmin_daily_metrics
                DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION coaching.reject_fixture_sleep();
            """)
            try:
                with self.assertRaises(errors.CheckViolation):
                    daily_import(conn, 34, garmin, day, "sleep", date(2025,4,2))
                self.assertFalse(conn.execute("SELECT EXISTS (SELECT FROM coaching.garmin_daily_metrics WHERE metric_date=%s)", (day,)).fetchone()[0])
                row = conn.execute("SELECT attempt_state,evidence,error_code FROM coaching.import_coverage WHERE day=%s AND source='sleep'", (day,)).fetchone()
                self.assertEqual(row, ("failed", None, "db_write"))
                claim(conn, ALLOWED)
                revision = rpc(conn, "metadata")["revision"]
                p = rpc(conn, "coverage", day, day, revision, 1)
                self.assertEqual(p["rows"][0]["attempt_state"], "failed")
                conn.execute("RESET ROLE")
            finally:
                conn.execute("DROP TRIGGER reject_fixture_sleep ON coaching.garmin_daily_metrics")
                conn.execute("DELETE FROM coaching.import_coverage WHERE day=%s AND source='sleep'", (day,))

    def test_fresh_and_failed_migration_transaction(self):
        with connect("v34_fresh") as conn:
            claim(conn, ALLOWED)
            self.assertEqual(rpc(conn, "metadata")["daily"]["count"], 0)
            conn.execute("RESET ROLE")
            source = MIGRATION.read_text(encoding="utf-8")
            broken = source.rsplit("COMMIT;", 1)[0] + "SELECT 1/0; COMMIT;"
            with self.assertRaises(errors.DivisionByZero):
                conn.execute(broken.replace("garmin_activities_keyset_v2", "should_rollback"))
            conn.execute("ROLLBACK")
            self.assertIsNone(conn.execute("SELECT to_regclass('coaching.should_rollback')").fetchone()[0])

    def test_roles_and_direct_access(self):
        with connect("v34_upgrade") as conn:
            functions = [("metadata", ()), ("activities", ("2024-01-01","2031-01-01","0")),
                         ("daily", ("2024-01-01","2031-01-01","0")), ("coverage", ("2024-01-01","2031-01-01","0"))]
            for role, subject in (("anon", ALLOWED), ("authenticated", DENIED), ("authenticated", "")):
                conn.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (subject,))
                conn.execute("SET ROLE " + role)
                for name, args in functions:
                    with self.assertRaises(errors.InsufficientPrivilege):
                        rpc(conn, name, *args)
                conn.execute("RESET ROLE")
            claim(conn, ALLOWED)
            for table in ("coaching.garmin_activities","coaching.garmin_daily_metrics","coaching.intelligence_state",
                          "coaching.import_coverage","dashboard_private.allowed_users"):
                with self.assertRaises(errors.InsufficientPrivilege):
                    conn.execute("SELECT * FROM " + table)
            self.assertEqual(rpc(conn, "metadata")["coverage"]["count"], 0)

    def test_restricted_writer_updates_revision(self):
        day = date(2025,5,1)
        garmin = Mock()
        garmin.get_daily_sleep.return_value = {"sleepTimeSeconds": 27000}
        with connect("v34_fresh") as conn, conn.transaction(force_rollback=True):
            conn.execute("""
                CREATE ROLE v34_test_writer NOLOGIN;
                GRANT USAGE ON SCHEMA coaching TO v34_test_writer;
                GRANT SELECT, INSERT, UPDATE ON coaching.garmin_activities, coaching.garmin_daily_metrics,
                    coaching.import_coverage TO v34_test_writer;
                GRANT SELECT ON coaching.intelligence_state TO v34_test_writer;
                GRANT UPDATE (revision) ON coaching.intelligence_state TO v34_test_writer;
            """)
            conn.execute("SET LOCAL ROLE v34_test_writer")
            before = conn.execute("SELECT revision FROM coaching.intelligence_state").fetchone()[0]
            self.assertTrue(daily_import(conn, 34, garmin, day, "sleep", date(2025,5,2)))
            self.assertGreater(conn.execute("SELECT revision FROM coaching.intelligence_state").fetchone()[0], before)
            with self.assertRaises(errors.InsufficientPrivilege), conn.transaction():
                conn.execute("DELETE FROM coaching.garmin_daily_metrics WHERE metric_date=%s", (day,))

    def test_upgrade_legacy_and_pagination(self):
        with connect("v34_upgrade") as conn:
            claim(conn, ALLOWED)
            legacy = conn.execute("SELECT public.dashboard_data()").fetchone()[0]
            self.assertEqual(legacy, self.before)
            self.assertEqual([len(legacy[key]) for key in ("activities","daily")], [2000,2000])
            meta = rpc(conn, "metadata")
            self.assertEqual(meta["anomalies"], {"activities": 2, "daily": 0})
            for kind in ("activities","daily"):
                args = ["2024-01-01","2031-01-10",meta["revision"], 250]
                cursor, seen, sizes = [], [], []
                while True:
                    page = rpc(conn, kind, *args, *cursor)
                    sizes.append(page["count"])
                    seen.extend(row.get("id", row["date"]) for row in page["rows"])
                    if not page["has_more"]:
                        self.assertIsNone(page["next_cursor"])
                        break
                    cursor = [page["next_cursor"]["date"]]
                    if kind == "activities":
                        cursor.append(page["next_cursor"]["key"])
                self.assertEqual(sizes, [250] * 10 + [1])
                self.assertEqual(seen, sorted(set(seen)))
                if kind == "activities":
                    self.assertEqual(seen[0], "9007199254740992")

    def test_exact_page_and_invalid_inputs(self):
        with connect("v34_upgrade") as conn:
            claim(conn, ALLOWED)
            revision = rpc(conn, "metadata")["revision"]
            args = ("2024-01-01","2024-01-01",revision)
            p = rpc(conn, "activities", *args, 2)
            self.assertEqual(p["count"], 2)
            self.assertFalse(p["has_more"])
            self.assertNotIn("private", str(p))
            self.assertNotIn("coordinates", str(p))
            item = p["rows"][0]
            self.assertEqual([item[field] for field in ("elevation_gain_m","elevation_loss_m","cadence_spm","power_w",
                             "temperature_c","fastest_1000_s","hr_zone_2_s","hr_zone_3_s")],
                             [0,12,167,230,-4,240,0,None])
            for extra in ((0,), (501,), (1, "2024-01-01"), (1, "2024-01-01", "1e9"),
                          (1, "2024-01-01", "9223372036854775808"), (1,None,"1")):
                with self.assertRaises(errors.InvalidParameterValue):
                    rpc(conn, "activities", *args, *extra)
            with self.assertRaises(errors.InvalidParameterValue):
                rpc(conn, "daily", "2024-02-01", "2024-01-01", revision)
            with self.assertRaises(errors.InvalidParameterValue):
                rpc(conn, "metadata", "today", "tomorrow")
            with self.assertRaises(errors.DatetimeFieldOverflow):
                rpc(conn, "metadata", "2025-02-29", "2025-03-01")

    def test_legacy_writer_between_pages(self):
        with connect("v34_fresh") as reader, connect("v34_fresh") as writer:
            writer.execute("INSERT INTO coaching.garmin_daily_metrics(metric_date) VALUES ('2025-01-01'), ('2025-01-02')")
            try:
                with writer.transaction(force_rollback=True):
                    writer.execute("UPDATE coaching.garmin_daily_metrics SET sleep_data='{\"sleepTimeSeconds\":36000}' WHERE metric_date='2025-01-02'")
                    first_revision = rpc_after_claim(reader)
                    args = ("2025-01-01","2025-01-02",first_revision,1)
                    first_page = rpc(reader, "daily", *args)
                    self.assertTrue(first_page["has_more"])
                    cursor = first_page["next_cursor"]["date"]
                    second_page = rpc(reader, "daily", *args, cursor)
                    self.assertIsNone(second_page["rows"][0]["sleep_h"])
                self.assertEqual(rpc(reader, "metadata")["revision"], first_revision)
                writer.execute("UPDATE coaching.garmin_daily_metrics SET sleep_data='{\"sleepTimeSeconds\":36000}' WHERE metric_date='2025-01-02'")
                with self.assertRaises(errors.SerializationFailure):
                    rpc(reader, "daily", *args, cursor)
            finally:
                writer.execute("DELETE FROM coaching.garmin_daily_metrics WHERE metric_date BETWEEN '2025-01-01' AND '2025-01-02'")


def rpc_after_claim(reader):
    claim(reader, ALLOWED)
    return rpc(reader, "metadata")["revision"]


if __name__ == "__main__":
    unittest.main()
