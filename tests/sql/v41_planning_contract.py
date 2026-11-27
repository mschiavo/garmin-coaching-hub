"""Prepared PostgreSQL contract tests for migration 0036.

Run only on four empty, disposable databases on an isolated loopback PostgreSQL
cluster. This module is intentionally not auto-discovered by the V3 SQL suite.
"""
from pathlib import Path
import os
import re
import unittest

import psycopg
from psycopg import errors, sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

ROOT = Path(__file__).resolve().parents[2]
ALLOWED = "00000000-0000-0000-0000-000000000001"


FRESH_DB = "gch_v41_planning_fresh"
UPGRADE_DB = "gch_v41_planning_upgrade"
ATOMIC_DB = "gch_v41_planning_atomic"
RESTORE_DB = "gch_v41_planning_restore"
MIGRATION = ROOT / "supabase/migrations/0036_v41_planning.sql"
SYNTHETIC_ACTIVITY = 9007199254800123


def connect(database: str):
    """Fail closed to loopback and the explicitly supplied ephemeral cluster ID."""
    options = conninfo_to_dict(os.environ["V34_TEST_DSN"])
    expected = os.environ.get("GCH_TEST_POSTGRES_SYSTEM_ID", "")
    if (options.get("host") != "127.0.0.1" or options.get("hostaddr", "127.0.0.1") != "127.0.0.1"
            or "service" in options or not re.fullmatch(r"[1-9][0-9]{0,19}", expected)
            or int(expected) > 2**64 - 1):
        raise ValueError("V4.1 SQL gate requires loopback and a verified synthetic cluster")
    conn = psycopg.connect(make_conninfo(**(options | {"dbname": database, "hostaddr": "127.0.0.1"})), autocommit=True)
    try:
        actual = conn.execute("SELECT system_identifier::text FROM pg_catalog.pg_control_system()").fetchone()[0]
        if actual != expected:
            raise ValueError("PostgreSQL cluster identity does not match the ephemeral runner")
        return conn
    except BaseException:
        conn.close()
        raise


def apply(conn, relative: str | Path):
    source = relative if isinstance(relative, Path) else ROOT / relative
    conn.execute(source.read_text(encoding="utf-8"))


class PlanningSchema(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        expected_system_id = os.environ.get("GCH_TEST_POSTGRES_SYSTEM_ID")
        if not expected_system_id:
            raise RuntimeError("Dedicated synthetic PostgreSQL cluster identity is required")
        for database in (FRESH_DB, UPGRADE_DB, ATOMIC_DB):
            with connect(database) as conn:
                if conn.execute("SELECT to_regnamespace('coaching')").fetchone()[0] is not None:
                    raise ValueError("Planning test database must be empty")
                apply(conn, "tests/sql/auth_stub.sql")
                apply(conn, "supabase/bootstrap.sql")
                apply(conn, "supabase/dashboard.sql")
                conn.execute("INSERT INTO dashboard_private.allowed_users(user_id) VALUES (%s)", (ALLOWED,))
                if database == UPGRADE_DB:
                    conn.execute("""
                        INSERT INTO coaching.garmin_activities(activity_id, activity_date, raw_data)
                        VALUES (%s, DATE '2026-01-12', '{\"synthetic\":true}'::jsonb)
                    """, (SYNTHETIC_ACTIVITY,))
                apply(conn, "supabase/migrations/0034_data_intelligence.sql")
                apply(conn, "supabase/migrations/0035_staging_reliability.sql")
                if database != ATOMIC_DB:
                    apply(conn, MIGRATION.relative_to(ROOT).as_posix())

        # Force an error before COMMIT and prove the migration is atomic on a
        # separate disposable database with the same 0035 baseline.
        with connect(ATOMIC_DB) as conn:
            source = MIGRATION.read_text(encoding="utf-8")
            broken = source.replace("COMMIT;", "SELECT 1/0; COMMIT;")
            if broken == source:
                raise AssertionError("Atomicity injection point missing")
            try:
                conn.execute(broken)
            except errors.DivisionByZero:
                pass
            else:
                raise AssertionError("Injected migration failure was not raised")
            conn.execute("ROLLBACK")
            if conn.execute("SELECT to_regnamespace('planning_private')").fetchone()[0] is not None:
                raise AssertionError("Failed migration left schema changes behind")

    def cycle(self, conn, start="2026-01-05", end="2026-02-01", timezone="Europe/Rome"):
        return conn.execute("""
            INSERT INTO planning_private.plan_cycles(name,start_date,end_date,timezone)
            VALUES ('Synthetic cycle',%s,%s,%s) RETURNING id
        """, (start, end, timezone)).fetchone()[0]

    def session(self, conn, cycle_id, session_date="2026-01-12", **extra):
        fields = {"sport": "running", "session_type": "easy", "title": "Synthetic run"} | extra
        return conn.execute("""
            INSERT INTO planning_private.planned_sessions
              (cycle_id,session_date,sport,session_type,title)
            VALUES (%s,%s,%s,%s,%s) RETURNING id
        """, (cycle_id, session_date, fields["sport"], fields["session_type"], fields["title"])).fetchone()[0]

    def test_fresh_and_upgrade_migration_objects_and_privileges(self):
        for database in (FRESH_DB, UPGRADE_DB):
            with connect(database) as conn:
                names = {row[0] for row in conn.execute("""
                    SELECT table_name FROM information_schema.tables
                    WHERE table_schema='planning_private'
                """).fetchall()}
                self.assertEqual(names, {"plan_cycles", "plan_weeks", "planned_sessions", "training_goals",
                                         "goal_milestones", "session_activity_links", "plan_change_events"})
                self.assertFalse(conn.execute("SELECT has_schema_privilege('authenticated','planning_private','USAGE')").fetchone()[0])
                self.assertFalse(conn.execute("SELECT has_schema_privilege('anon','planning_private','USAGE')").fetchone()[0])
                secured = conn.execute("""
                    SELECT count(*) FROM pg_catalog.pg_class c
                    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='planning_private' AND c.relkind='r'
                      AND c.relrowsecurity AND c.relforcerowsecurity
                """).fetchone()[0]
                self.assertEqual(secured, 7)
        with connect(UPGRADE_DB) as conn:
            self.assertEqual(conn.execute("SELECT raw_data->>'synthetic' FROM coaching.garmin_activities WHERE activity_id=%s",
                                          (SYNTHETIC_ACTIVITY,)).fetchone()[0], "true")

    def test_authenticated_cannot_read_private_schema(self):
        with connect(FRESH_DB) as conn:
            conn.execute("SET ROLE authenticated")
            with self.assertRaises(errors.InsufficientPrivilege):
                conn.execute("SELECT * FROM planning_private.plan_cycles").fetchall()
            conn.execute("RESET ROLE")

    def test_cycle_timezone_date_constraints_and_immutability(self):
        with connect(FRESH_DB) as conn:
            with self.assertRaises(errors.CheckViolation):
                self.cycle(conn, start="2026-02-01", end="2026-01-01")
            with self.assertRaises(errors.InvalidParameterValue):
                self.cycle(conn, timezone="not/a-real-zone")
            cycle = self.cycle(conn)
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("UPDATE planning_private.plan_cycles SET timezone='Europe/Paris' WHERE id=%s", (cycle,))
            with self.assertRaises(errors.InvalidParameterValue):
                self.session(conn, cycle, session_date="2026-02-02")

    def test_iso_week_targets_goal_types_and_cycle_references(self):
        with connect(FRESH_DB) as conn:
            cycle = self.cycle(conn)
            with self.assertRaises(errors.CheckViolation):
                conn.execute("INSERT INTO planning_private.plan_weeks(cycle_id,week_start) VALUES (%s,DATE '2026-01-06')", (cycle,))
            with self.assertRaises(errors.CheckViolation):
                conn.execute("""INSERT INTO planning_private.training_goals
                    (cycle_id,scope,metric,target,unit,direction,start_date,end_date,timezone)
                    VALUES (%s,'week','distance',100,'s','at_least',DATE '2026-01-05',DATE '2026-01-11','Europe/Rome')""", (cycle,))
            with self.assertRaises(errors.CheckViolation):
                conn.execute("""INSERT INTO planning_private.training_goals
                    (scope,metric,target,unit,direction,start_date,end_date,timezone)
                    VALUES ('race','race_time',0,'s','lower_is_better',DATE '2026-01-05',DATE '2026-01-11','Europe/Rome')""")
            goal = conn.execute("""INSERT INTO planning_private.training_goals
                (scope,metric,target,unit,direction,start_date,end_date,timezone,event_name)
                VALUES ('race','race_time',7200,'s','lower_is_better',DATE '2026-01-05',DATE '2026-01-11','Europe/Rome','Synthetic race')
                RETURNING id""").fetchone()[0]
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("UPDATE planning_private.training_goals SET timezone='Europe/Paris' WHERE id=%s", (goal,))
            with self.assertRaises(errors.ForeignKeyViolation):
                conn.execute("""INSERT INTO planning_private.planned_sessions
                    (cycle_id,session_date,sport,session_type,title)
                    VALUES ('00000000-0000-0000-0000-000000000099',DATE '2026-01-12','running','easy','Missing cycle')""")

    def test_revision_link_cardinality_and_event_log(self):
        with connect(UPGRADE_DB) as conn:
            cycle = self.cycle(conn)
            first = self.session(conn, cycle)
            second = self.session(conn, cycle, session_date="2026-01-13")
            revision = conn.execute("SELECT revision FROM planning_private.planned_sessions WHERE id=%s", (first,)).fetchone()[0]
            conn.execute("UPDATE planning_private.planned_sessions SET title='Edited synthetic run' WHERE id=%s", (first,))
            self.assertEqual(conn.execute("SELECT revision FROM planning_private.planned_sessions WHERE id=%s", (first,)).fetchone()[0], revision + 1)
            conn.execute("""INSERT INTO planning_private.session_activity_links(session_id,activity_id)
                VALUES (%s,%s)""", (first, SYNTHETIC_ACTIVITY))
            with self.assertRaises(errors.UniqueViolation):
                conn.execute("""INSERT INTO planning_private.session_activity_links(session_id,activity_id)
                    VALUES (%s,%s)""", (second, SYNTHETIC_ACTIVITY))
            with self.assertRaises(errors.ForeignKeyViolation):
                conn.execute("""INSERT INTO planning_private.session_activity_links(session_id,activity_id)
                    VALUES (%s,9007199254800999)""", (second,))
            link = conn.execute("SELECT id FROM planning_private.session_activity_links WHERE session_id=%s", (first,)).fetchone()[0]
            conn.execute("UPDATE planning_private.session_activity_links SET unlinked_at=clock_timestamp() WHERE id=%s", (link,))
            conn.execute("""INSERT INTO planning_private.session_activity_links(session_id,activity_id)
                VALUES (%s,%s)""", (second, SYNTHETIC_ACTIVITY))
            with self.assertRaises(errors.ObjectNotInPrerequisiteState):
                conn.execute("DELETE FROM planning_private.plan_change_events")

    def test_upgrade_archive_row_unchanged_by_planning_writes(self):
        with connect(UPGRADE_DB) as conn:
            before = conn.execute("SELECT activity_date, raw_data FROM coaching.garmin_activities WHERE activity_id=%s",
                                  (SYNTHETIC_ACTIVITY,)).fetchone()
            cycle = self.cycle(conn)
            self.session(conn, cycle)
            after = conn.execute("SELECT activity_date, raw_data FROM coaching.garmin_activities WHERE activity_id=%s",
                                 (SYNTHETIC_ACTIVITY,)).fetchone()
            self.assertEqual(after, before)


class PlanningRestore(unittest.TestCase):
    """Run only after the workflow restores the synthetic custom-format dump."""
    def test_restored_data_constraints_and_acl(self):
        with connect(UPGRADE_DB) as source, connect(RESTORE_DB) as restored:
            source_tables = {row[0] for row in source.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='planning_private' AND table_type='BASE TABLE'
            """).fetchall()}
            restored_tables = {row[0] for row in restored.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema='planning_private' AND table_type='BASE TABLE'
            """).fetchall()}
            self.assertEqual(restored_tables, source_tables)
            self.assertEqual(restored_tables, {"plan_cycles", "plan_weeks", "planned_sessions", "training_goals",
                                               "goal_milestones", "session_activity_links", "plan_change_events"})

            def constraints(conn):
                return conn.execute("""
                    SELECT c.conname, c.contype, pg_catalog.pg_get_constraintdef(c.oid, true), c.convalidated
                    FROM pg_catalog.pg_constraint c
                    JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
                    WHERE n.nspname='planning_private' ORDER BY c.conname
                """).fetchall()

            self.assertEqual(constraints(restored), constraints(source))

            def indexes(conn):
                return conn.execute("""
                    SELECT indexname, indexdef FROM pg_catalog.pg_indexes
                    WHERE schemaname='planning_private' ORDER BY indexname
                """).fetchall()

            self.assertEqual(indexes(restored), indexes(source))

            def triggers(conn):
                return conn.execute("""
                    SELECT c.relname, t.tgname, pg_catalog.pg_get_triggerdef(t.oid, true), t.tgenabled
                    FROM pg_catalog.pg_trigger t
                    JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
                    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='planning_private' AND NOT t.tgisinternal
                    ORDER BY c.relname, t.tgname
                """).fetchall()

            self.assertEqual(triggers(restored), triggers(source))

            def row_counts(conn):
                return {
                    table: conn.execute(
                        sql.SQL("SELECT count(*) FROM {}.{}").format(
                            sql.Identifier("planning_private"), sql.Identifier(table),
                        )
                    ).fetchone()[0]
                    for table in sorted(restored_tables)
                }

            self.assertEqual(row_counts(restored), row_counts(source))
            self.assertGreater(row_counts(restored)["plan_cycles"], 0)
            source_activity = source.execute(
                "SELECT activity_date, raw_data FROM coaching.garmin_activities WHERE activity_id=%s",
                (SYNTHETIC_ACTIVITY,),
            ).fetchone()
            restored_activity = restored.execute(
                "SELECT activity_date, raw_data FROM coaching.garmin_activities WHERE activity_id=%s",
                (SYNTHETIC_ACTIVITY,),
            ).fetchone()
            self.assertEqual(restored_activity, source_activity)

            secured = restored.execute("""
                SELECT count(*) FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='planning_private' AND c.relkind='r'
                  AND c.relrowsecurity AND c.relforcerowsecurity
            """).fetchone()[0]
            self.assertEqual(secured, 7)
            self.assertFalse(restored.execute(
                "SELECT has_schema_privilege('authenticated','planning_private','USAGE')"
            ).fetchone()[0])
            with self.assertRaises(errors.CheckViolation):
                restored.execute("""INSERT INTO planning_private.training_goals
                    (scope,metric,target,unit,direction,start_date,end_date,timezone)
                    VALUES ('week','distance',100,'s','at_least',DATE '2026-01-05',DATE '2026-01-11','Europe/Rome')""")


if __name__ == "__main__":
    unittest.main(verbosity=2)
