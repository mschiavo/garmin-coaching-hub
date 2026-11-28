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
RPC_MIGRATION = ROOT / "supabase/migrations/0037_v41_planning_rpc.sql"
SYNTHETIC_ACTIVITY = 9007199254800123
DENIED = "00000000-0000-0000-0000-000000000002"


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
                    apply(conn, RPC_MIGRATION.relative_to(ROOT).as_posix())

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
            apply(conn, MIGRATION.relative_to(ROOT).as_posix())
            rpc_source = RPC_MIGRATION.read_text(encoding="utf-8")
            broken_rpc = rpc_source.replace("COMMIT;", "SELECT 1/0; COMMIT;")
            if broken_rpc == rpc_source:
                raise AssertionError("RPC migration atomicity injection point missing")
            try:
                conn.execute(broken_rpc)
            except errors.DivisionByZero:
                pass
            else:
                raise AssertionError("Injected RPC migration failure was not raised")
            conn.execute("ROLLBACK")
            if conn.execute("SELECT to_regclass('planning_private.api_state')").fetchone()[0] is not None:
                raise AssertionError("Failed RPC migration left API state behind")
            if conn.execute("SELECT to_regprocedure('public.planning_create_cycle_v1(text,date,date,text,text)')").fetchone()[0] is not None:
                raise AssertionError("Failed RPC migration left functions behind")

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
                                         "goal_milestones", "session_activity_links", "plan_change_events", "api_state"})
                self.assertFalse(conn.execute("SELECT has_schema_privilege('authenticated','planning_private','USAGE')").fetchone()[0])
                self.assertFalse(conn.execute("SELECT has_schema_privilege('anon','planning_private','USAGE')").fetchone()[0])
                secured = conn.execute("""
                    SELECT count(*) FROM pg_catalog.pg_class c
                    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname='planning_private' AND c.relkind='r'
                      AND c.relrowsecurity AND c.relforcerowsecurity
                """).fetchone()[0]
                self.assertEqual(secured, 8)
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

            week_id = conn.execute("""
                INSERT INTO planning_private.plan_weeks(cycle_id,week_start)
                VALUES (%s,DATE '2026-01-05') RETURNING id
            """, (cycle,)).fetchone()[0]
            conn.execute("""INSERT INTO planning_private.planned_sessions
                (cycle_id,week_id,session_date,sport,session_type,title)
                VALUES (%s,%s,DATE '2026-01-10','running','easy','Session in matching week')""",
                (cycle, week_id))

            second_cycle = self.cycle(conn, start="2026-01-05", end="2026-02-01")
            with self.assertRaises(errors.ForeignKeyViolation):
                conn.execute("""INSERT INTO planning_private.planned_sessions
                    (cycle_id,week_id,session_date,sport,session_type,title)
                    VALUES (%s,%s,DATE '2026-01-10','running','easy','Mismatched cycle and week')""",
                    (second_cycle, week_id))

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
            cycle_fk_count = conn.execute("""
                SELECT count(*) FROM pg_catalog.pg_constraint
                WHERE conrelid='planning_private.planned_sessions'::regclass
                  AND confrelid='planning_private.plan_cycles'::regclass
                  AND contype='f'
            """).fetchone()[0]
            self.assertEqual(cycle_fk_count, 1, "The planned-session cycle foreign key must remain installed")
            missing_cycle = "00000000-0000-0000-0000-000000000099"
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("""INSERT INTO planning_private.planned_sessions
                    (cycle_id,session_date,sport,session_type,title)
                    VALUES (%s,DATE '2026-01-12','running','easy','Missing cycle')""", (missing_cycle,))
            self.assertEqual(conn.execute(
                "SELECT count(*) FROM planning_private.planned_sessions WHERE cycle_id=%s", (missing_cycle,),
            ).fetchone()[0], 0, "A session with a nonexistent cycle must never persist")

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
            # DELETE against an empty table is a harmless no-op: the append-only
            # contract protects existing events from mutation, not inert SQL.
            with connect(FRESH_DB) as empty_conn:
                empty_delete = empty_conn.execute("DELETE FROM planning_private.plan_change_events")
                self.assertEqual(empty_delete.rowcount, 0)

            event_id = conn.execute("""INSERT INTO planning_private.plan_change_events
                (entity_kind,entity_id,revision,event_kind)
                VALUES ('session',%s,1,'created') RETURNING id""", (first,)).fetchone()[0]
            event_before = conn.execute("""SELECT entity_kind,entity_id,revision,event_kind
                FROM planning_private.plan_change_events WHERE id=%s""", (event_id,)).fetchone()
            with self.assertRaises(errors.ObjectNotInPrerequisiteState):
                conn.execute("UPDATE planning_private.plan_change_events SET event_kind='edited' WHERE id=%s", (event_id,))
            self.assertEqual(conn.execute("""SELECT entity_kind,entity_id,revision,event_kind
                FROM planning_private.plan_change_events WHERE id=%s""", (event_id,)).fetchone(), event_before)
            with self.assertRaises(errors.ObjectNotInPrerequisiteState):
                conn.execute("DELETE FROM planning_private.plan_change_events WHERE id=%s", (event_id,))
            self.assertEqual(conn.execute("""SELECT entity_kind,entity_id,revision,event_kind
                FROM planning_private.plan_change_events WHERE id=%s""", (event_id,)).fetchone(), event_before)
            with self.assertRaises(errors.ObjectNotInPrerequisiteState):
                conn.execute("TRUNCATE planning_private.plan_change_events")
            self.assertEqual(conn.execute(
                "SELECT count(*) FROM planning_private.plan_change_events WHERE id=%s", (event_id,),
            ).fetchone()[0], 1, "TRUNCATE must not remove the existing event")

    def test_upgrade_archive_row_unchanged_by_planning_writes(self):
        with connect(UPGRADE_DB) as conn:
            before = conn.execute("SELECT activity_date, raw_data FROM coaching.garmin_activities WHERE activity_id=%s",
                                  (SYNTHETIC_ACTIVITY,)).fetchone()
            cycle = self.cycle(conn)
            self.session(conn, cycle)
            after = conn.execute("SELECT activity_date, raw_data FROM coaching.garmin_activities WHERE activity_id=%s",
                                 (SYNTHETIC_ACTIVITY,)).fetchone()
            self.assertEqual(after, before)


class PlanningRPC(unittest.TestCase):
    @staticmethod
    def login_as(conn, user_id):
        conn.execute("SET ROLE authenticated")
        conn.execute("SELECT pg_catalog.set_config('request.jwt.claim.sub',%s,false)", (user_id,))

    def test_rpc_acl_and_private_schema_are_closed(self):
        with connect(FRESH_DB) as conn:
            expected = {
                "planning_list_cycles_v1", "planning_get_cycle_v1", "planning_create_cycle_v1",
                "planning_update_cycle_v1", "planning_cancel_cycle_v1", "planning_list_sessions_v1",
                "planning_get_session_v1", "planning_create_session_v1", "planning_update_session_v1",
                "planning_reschedule_session_v1", "planning_set_session_status_v1",
            }
            names = {row[0] for row in conn.execute("""
                SELECT p.proname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname LIKE 'planning_%_v1'
            """).fetchall()}
            self.assertEqual(names, expected)
            self.assertFalse(conn.execute("SELECT has_schema_privilege('authenticated','planning_private','USAGE')").fetchone()[0])
            self.assertFalse(conn.execute("SELECT has_function_privilege('anon','public.planning_list_cycles_v1(text,date,date,integer,text)','EXECUTE')").fetchone()[0])
            self.assertTrue(conn.execute("SELECT has_function_privilege('authenticated','public.planning_list_cycles_v1(text,date,date,integer,text)','EXECUTE')").fetchone()[0])
            with self.assertRaises(errors.InsufficientPrivilege):
                conn.execute("SET ROLE anon")
                conn.execute("SELECT public.planning_list_cycles_v1()")

    def test_v341_legacy_and_v2_rpc_contracts_remain_installed(self):
        with connect(FRESH_DB) as conn:
            self.assertEqual(conn.execute("SELECT schema_version FROM coaching.intelligence_state WHERE singleton").fetchone()[0], 34)
            for signature in (
                "public.dashboard_data()", "public.dashboard_metadata_v2(text,text)",
                "public.dashboard_activities_v2(text,text,text,integer,text,text)",
                "public.dashboard_daily_v2(text,text,text,integer,text)",
                "public.dashboard_coverage_v2(text,text,text,integer,text,text)",
            ):
                self.assertIsNotNone(conn.execute("SELECT pg_catalog.to_regprocedure(%s)", (signature,)).fetchone()[0], signature)

    def test_auth_allowlist_and_account_switch_are_server_enforced(self):
        with connect(FRESH_DB) as conn:
            self.login_as(conn, ALLOWED)
            allowed = conn.execute("SELECT public.planning_create_cycle_v1('Allowed plan','2026-03-02','2026-03-29','Europe/Rome','draft')").fetchone()[0]
            conn.execute("SELECT pg_catalog.set_config('request.jwt.claim.sub',%s,false)", (DENIED,))
            for query, params in (
                ("SELECT public.planning_list_cycles_v1()", ()),
                ("SELECT public.planning_get_cycle_v1(%s)", (allowed["cycle"]["id"],)),
                ("SELECT public.planning_cancel_cycle_v1(%s,'1')", (allowed["cycle"]["id"],)),
                ("SELECT public.planning_create_cycle_v1('Denied write','2026-03-30','2026-04-05','Europe/Rome','draft')", ()),
                ("SELECT public.planning_get_cycle_v1('00000000-0000-0000-0000-000000000099')", ()),
            ):
                with self.assertRaises(errors.InsufficientPrivilege):
                    conn.execute(query, params)
            conn.execute("SELECT pg_catalog.set_config('request.jwt.claim.sub','',false)")
            with self.assertRaises(errors.InsufficientPrivilege):
                conn.execute("SELECT public.planning_list_cycles_v1()")
            conn.execute("SELECT pg_catalog.set_config('request.jwt.claim.sub',%s,false)", (ALLOWED,))
            self.assertEqual(conn.execute("SELECT public.planning_get_cycle_v1(%s)", (allowed["cycle"]["id"],)).fetchone()[0]["cycle"]["id"], allowed["cycle"]["id"])
            conn.execute("RESET ROLE")
            self.assertEqual(conn.execute("SELECT count(*) FROM planning_private.plan_cycles WHERE name='Denied write'").fetchone()[0], 0)

    def test_cycle_session_persistence_history_and_revision_conflicts(self):
        with connect(FRESH_DB) as conn:
            self.login_as(conn, ALLOWED)
            created = conn.execute("""
                SELECT public.planning_create_cycle_v1('RPC cycle','2026-04-06','2026-05-03','Europe/Rome','draft')
            """).fetchone()[0]
            cycle_id = created["cycle"]["id"]
            self.assertEqual(created["cycle"]["revision"], "1")
            updated = conn.execute("SELECT public.planning_update_cycle_v1(%s,'1',%s::jsonb)",
                                   (cycle_id, '{"name":"RPC cycle updated"}')).fetchone()[0]
            self.assertEqual(updated["cycle"]["revision"], "2")
            with self.assertRaises(errors.SerializationFailure):
                conn.execute("SELECT public.planning_update_cycle_v1(%s,'1','{\"name\":\"stale\"}'::jsonb)", (cycle_id,))

            session_result = conn.execute("""
                SELECT public.planning_create_session_v1('2026-04-08','running','easy','RPC session',%s,
                  '2026-04-06',0,5000,NULL,'synthetic description',NULL)
            """, (cycle_id,)).fetchone()[0]
            session = session_result["session"]
            session_id = session["id"]
            self.assertEqual(session["target_distance_m"], "5000.00")
            self.assertEqual(session["week_start"], "2026-04-06")
            self.assertEqual(session["description"], "synthetic description")
            edited = conn.execute("SELECT public.planning_update_session_v1(%s,'1','{\"title\":\"Updated session\"}'::jsonb)",
                                  (session_id,)).fetchone()[0]["session"]
            self.assertEqual(edited["revision"], "2")
            with self.assertRaises(errors.SerializationFailure):
                conn.execute("SELECT public.planning_update_session_v1(%s,'1','{\"title\":\"stale\"}'::jsonb)", (session_id,))
            moved = conn.execute("SELECT public.planning_reschedule_session_v1(%s,'2','2026-04-09')", (session_id,)).fetchone()[0]["session"]
            self.assertEqual(moved["session_date"], "2026-04-09")
            cancelled = conn.execute("SELECT public.planning_set_session_status_v1(%s,'3','cancelled','manual')", (session_id,)).fetchone()[0]["session"]
            self.assertEqual(cancelled["status"], "cancelled")
            self.assertEqual(conn.execute("SELECT public.planning_get_session_v1(%s)", (session_id,)).fetchone()[0]["revision"], "4")
            cycle = conn.execute("SELECT public.planning_get_cycle_v1(%s)", (cycle_id,)).fetchone()[0]
            self.assertEqual(cycle["cycle"]["revision"], "2")
            self.assertEqual(len(cycle["sessions"]), 1)
            extra = conn.execute("""
                SELECT public.planning_create_session_v1('2026-04-10','running','tempo','Manual completion',%s)
            """, (cycle_id,)).fetchone()[0]["session"]
            completed = conn.execute("SELECT public.planning_set_session_status_v1(%s,'1','completed','manual')",
                                     (extra["id"],)).fetchone()[0]["session"]
            self.assertEqual(completed["completion_kind"], "manual")
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("SELECT public.planning_set_session_status_v1(%s,'2','planned','verified')", (extra["id"],))
            conn.execute("RESET ROLE")
            self.assertEqual(conn.execute("SELECT count(*) FROM planning_private.plan_change_events WHERE entity_id IN (%s,%s)",
                                          (cycle_id, session_id)).fetchone()[0], 6)

    def test_pagination_filters_and_stale_snapshot_are_atomic(self):
        with connect(FRESH_DB) as conn:
            self.login_as(conn, ALLOWED)
            first = conn.execute("SELECT public.planning_create_cycle_v1('Page one','2026-06-01','2026-06-07','UTC','draft')").fetchone()[0]["cycle"]["id"]
            conn.execute("SELECT public.planning_create_cycle_v1('Page two','2026-06-08','2026-06-14','UTC','draft')")
            page = conn.execute("SELECT public.planning_list_cycles_v1(NULL,'2026-06-01','2026-06-30',1,NULL)").fetchone()[0]
            self.assertEqual(page["count"], 2)
            self.assertTrue(page["has_more"])
            self.assertIsNotNone(page["next_cursor"])
            second = conn.execute("SELECT public.planning_list_cycles_v1(NULL,'2026-06-01','2026-06-30',1,%s)", (page["next_cursor"],)).fetchone()[0]
            self.assertFalse(second["has_more"])
            self.assertEqual(len(second["rows"]), 1)
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("SELECT public.planning_list_cycles_v1(NULL,NULL,NULL,101,NULL)")
            conn.execute("SELECT public.planning_update_cycle_v1(%s,'1','{\"name\":\"changed\"}'::jsonb)", (first,))
            with self.assertRaises(errors.SerializationFailure):
                conn.execute("SELECT public.planning_list_cycles_v1(NULL,'2026-06-01','2026-06-30',1,%s)", (page["next_cursor"],))
            conn.execute("RESET ROLE")

    def test_invalid_mutation_inputs_do_not_persist_and_events_are_append_only(self):
        with connect(FRESH_DB) as conn:
            self.login_as(conn, ALLOWED)
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("SELECT public.planning_create_cycle_v1('bad zone','2026-07-01','2026-07-07','Not/AZone','draft')")
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("SELECT public.planning_create_cycle_v1('bad state','2026-07-01','2026-07-07','UTC','completed')")
            created = conn.execute("SELECT public.planning_create_cycle_v1('Cancel me','2026-07-01','2026-07-07','UTC','draft')").fetchone()[0]
            cycle_id = created["cycle"]["id"]
            cancelled = conn.execute("SELECT public.planning_cancel_cycle_v1(%s,'1')", (cycle_id,)).fetchone()[0]
            self.assertEqual(cancelled["cycle"]["status"], "cancelled")
            conn.execute("RESET ROLE")
            event_count = conn.execute("SELECT count(*) FROM planning_private.plan_change_events WHERE entity_id=%s", (cycle_id,)).fetchone()[0]
            self.assertEqual(event_count, 2)
            with self.assertRaises(errors.InvalidParameterValue):
                conn.execute("SELECT public.planning_update_cycle_v1(%s,'2','{\"name\":\"after cancel\"}'::jsonb)", (cycle_id,))
            with self.assertRaises(errors.ObjectNotInPrerequisiteState):
                conn.execute("DELETE FROM planning_private.plan_change_events WHERE entity_id=%s", (cycle_id,))
            self.assertEqual(conn.execute("SELECT count(*) FROM planning_private.plan_change_events WHERE entity_id=%s", (cycle_id,)).fetchone()[0], 2)


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
                                               "goal_milestones", "session_activity_links", "plan_change_events", "api_state"})

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
            self.assertEqual(secured, 8)
            self.assertFalse(restored.execute(
                "SELECT has_schema_privilege('authenticated','planning_private','USAGE')"
            ).fetchone()[0])
            self.assertTrue(restored.execute(
                "SELECT has_function_privilege('authenticated','public.planning_create_cycle_v1(text,date,date,text,text)','EXECUTE')"
            ).fetchone()[0])
            self.assertFalse(restored.execute(
                "SELECT has_function_privilege('anon','public.planning_create_cycle_v1(text,date,date,text,text)','EXECUTE')"
            ).fetchone()[0])
            with self.assertRaises(errors.CheckViolation):
                restored.execute("""INSERT INTO planning_private.training_goals
                    (scope,metric,target,unit,direction,start_date,end_date,timezone)
                    VALUES ('week','distance',100,'s','at_least',DATE '2026-01-05',DATE '2026-01-11','Europe/Rome')""")


if __name__ == "__main__":
    unittest.main(verbosity=2)
