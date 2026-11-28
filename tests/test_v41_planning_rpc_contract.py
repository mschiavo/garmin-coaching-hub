"""Static invariants for the additive V4.1 RPC migration."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/0037_v41_planning_rpc.sql"


class PlanningRPCCatalog(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8")

    def test_expected_public_rpc_set_is_security_definer_with_empty_search_path(self):
        expected = {
            "planning_list_cycles_v1", "planning_get_cycle_v1", "planning_create_cycle_v1",
            "planning_update_cycle_v1", "planning_cancel_cycle_v1", "planning_list_sessions_v1",
            "planning_get_session_v1", "planning_create_session_v1", "planning_update_session_v1",
            "planning_reschedule_session_v1", "planning_set_session_status_v1",
        }
        actual = set(re.findall(r"(?mi)^CREATE FUNCTION public\.(planning_[a-z_]+_v1)\(", self.sql))
        self.assertEqual(actual, expected)
        for name in expected:
            definition = re.search(rf"(?mis)^CREATE FUNCTION public\.{name}\(.*?\nEND \$\$;", self.sql)
            self.assertIsNotNone(definition, name)
            self.assertRegex(definition.group(0), r"LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''")
            self.assertIn(f"REVOKE ALL ON FUNCTION public.{name}", self.sql)
            self.assertIn(f"GRANT EXECUTE ON FUNCTION public.{name}", self.sql)

    def test_server_allowlist_and_private_helpers_are_not_publicly_callable(self):
        auth = re.search(r"(?mis)^CREATE FUNCTION planning_private\.require_allowed_user\(\).*?\nEND \$\$;", self.sql)
        self.assertIsNotNone(auth)
        body = auth.group(0)
        self.assertIn("auth.uid()", body)
        self.assertIn("dashboard_private.allowed_users", body)
        self.assertIn("ERRCODE = '42501'", body)
        for helper in ("require_allowed_user", "bump_api_revision", "cycle_json", "session_json", "encode_cursor"):
            self.assertIn(f"REVOKE ALL ON FUNCTION planning_private.{helper}", self.sql)

    def test_mutations_are_versioned_logged_and_direct_table_access_stays_revoked(self):
        self.assertIn("CREATE TABLE planning_private.api_state", self.sql)
        self.assertIn("ENABLE ROW LEVEL SECURITY", self.sql)
        self.assertIn("FORCE ROW LEVEL SECURITY", self.sql)
        self.assertIn("UPDATE planning_private.api_state SET revision = revision + 1", self.sql)
        self.assertIn("INSERT INTO planning_private.plan_change_events", self.sql)
        self.assertIn("NOTIFY pgrst, 'reload schema'", self.sql)
        self.assertIn("REVOKE ALL ON TABLE planning_private.api_state FROM PUBLIC, anon, authenticated", self.sql)
        self.assertNotRegex(self.sql, r"(?i)GRANT\s+[^;]+\s+ON\s+(TABLE|ALL TABLES)\s+planning_private")
        self.assertNotRegex(self.sql, r"(?i)GRANT\s+[^;]+\s+TO\s+(PUBLIC|anon|authenticated)[^;]*\b(ALL|TABLES)\b")


if __name__ == "__main__":
    unittest.main(verbosity=2)
