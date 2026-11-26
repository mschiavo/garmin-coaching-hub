import unittest
from pathlib import Path
from unittest.mock import patch

import psycopg
from tools.local_supabase_e2e import (
    LocalTargetError, _conn, read_cli_env, validate_api_url, validate_local_database,
)


class LocalSupabaseTargetTests(unittest.TestCase):
    SYSTEM_ID = "7421098365012345678"
    DSN = "host=127.0.0.1 port=54322 dbname=gch_v341_fixture user=postgres password=synthetic"

    def test_accepts_only_exact_loopback_fixture_target(self):
        values = validate_local_database(self.DSN, self.SYSTEM_ID, "gch_v341_fixture")
        self.assertEqual(values["host"], "127.0.0.1")
        self.assertEqual(validate_api_url("http://127.0.0.1:54321"), "http://127.0.0.1:54321")

    def test_rejects_private_public_and_cloud_database_hosts(self):
        for host in ("10.1.2.3", "192.168.1.20", "172.20.0.2", "db.example.supabase.co", "localhost"):
            with self.subTest(host=host), self.assertRaises(LocalTargetError):
                validate_local_database(self.DSN.replace("127.0.0.1", host), self.SYSTEM_ID,
                                        "gch_v341_fixture")

    def test_rejects_wrong_database_port_and_missing_or_invalid_cluster_identity(self):
        cases = (
            (self.DSN.replace("54322", "5432"), self.SYSTEM_ID, "gch_v341_fixture"),
            (self.DSN.replace("gch_v341_fixture", "postgres"), self.SYSTEM_ID, "gch_v341_fixture"),
            (self.DSN, "", "gch_v341_fixture"),
            (self.DSN, "0", "gch_v341_fixture"),
            (self.DSN, "18446744073709551616", "gch_v341_fixture"),
        )
        for dsn, system_id, database in cases:
            with self.subTest(dsn=dsn, system_id=system_id), self.assertRaises(LocalTargetError):
                validate_local_database(dsn, system_id, database)
        with self.assertRaises(LocalTargetError):
            validate_local_database(self.DSN.replace("gch_v341_fixture", "other_db"),
                                    self.SYSTEM_ID, "other_db")

    def test_rejects_actual_cluster_identity_mismatch(self):
        class FakeConnection:
            closed = False

            def execute(self, _query):
                return self

            def fetchone(self):
                return ("123456789",)

            def close(self):
                self.closed = True

        connection = FakeConnection()
        with patch.object(psycopg, "connect", return_value=connection):
            with self.assertRaisesRegex(LocalTargetError, "Identificatore"):
                _conn(self.DSN, self.SYSTEM_ID, "gch_v341_fixture")
        self.assertTrue(connection.closed)

    def test_rejects_api_cloud_or_non_loopback_targets(self):
        for url in ("https://example.supabase.co", "http://10.0.0.2:54321",
                    "http://127.0.0.1:54322", "http://127.0.0.1:54321/rest/v1",
                    "http://user:password@127.0.0.1:54321"):
            with self.subTest(url=url), self.assertRaises(LocalTargetError):
                validate_api_url(url)

    def test_cli_env_reader_selects_only_local_public_connection_values(self):
        content = "\n".join((
            "API_URL=http://127.0.0.1:54321",
            "DB_URL=postgresql://postgres:synthetic@127.0.0.1:54322/postgres",
            "ANON_KEY=synthetic-local-key",
            "SERVICE_ROLE_KEY=must-not-be-imported-or-logged",
        ))
        values = read_cli_env(content)
        self.assertEqual(set(values), {"API_URL", "DB_URL", "ANON_KEY"})
        self.assertNotIn("SERVICE_ROLE_KEY", values)

    def test_workflow_is_manual_pinned_and_cloud_secret_free(self):
        workflow = Path(".github/workflows/v341-local-supabase-e2e.yml").read_text(encoding="utf-8")
        self.assertRegex(workflow, r"(?m)^on:\s*\n\s+workflow_dispatch:\s*$")
        self.assertNotRegex(workflow, r"(?m)^\s+(push|pull_request|schedule):")
        self.assertIn("permissions:\n  contents: read", workflow)
        self.assertIn("version: 3.4.0", workflow)
        self.assertIn("supabase/postgres:17.6.1.136", workflow)
        self.assertIn("supabase/gotrue:v2.198.0", workflow)
        self.assertIn("postgrest/postgrest:v14.18", workflow)
        self.assertIn("kong/kong:3.9.5", workflow)
        self.assertIn("supabase config validate", workflow)
        self.assertNotIn("secrets.", workflow)
        self.assertNotIn("supabase link", workflow)
        self.assertNotIn("supabase db push", workflow)
        self.assertNotIn("supabase.co", workflow)
        self.assertIn("tools/local_supabase_e2e.py", workflow)
        self.assertIn("pg_control_system()", workflow)
        self.assertIn("if: always()", workflow)
        self.assertIn('!= "$RUNNER_TEMP/gch-v341-supabase"', workflow)
        browser_config = Path("dashboard/playwright.integration.config.ts").read_text(encoding="utf-8")
        browser_test = Path("dashboard/tests/supabase.integration.spec.ts").read_text(encoding="utf-8")
        self.assertIn("npm run preview", browser_config)
        self.assertNotIn("page.route", browser_config + browser_test)
        self.assertNotIn("route.fulfill", browser_config + browser_test)


if __name__ == "__main__":
    unittest.main()
