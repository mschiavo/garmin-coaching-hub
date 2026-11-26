import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import psycopg
from tools.local_supabase_e2e import (
    LocalTargetError, _conn, read_cli_env, validate_api_url, validate_local_database,
)


class LocalSupabaseTargetTests(unittest.TestCase):
    SYSTEM_ID = "7421098365012345678"
    DSN = "host=127.0.0.1 port=54322 dbname=postgres user=postgres password=synthetic"

    def test_harness_starts_as_repository_module(self):
        result = subprocess.run(
            [sys.executable, "-m", "tools.local_supabase_e2e", "--help"],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True,
            text=True,
            check=False,
            timeout=15,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Synthetic end-to-end probes", result.stdout)

    def test_accepts_only_exact_loopback_fixture_target(self):
        values = validate_local_database(self.DSN, self.SYSTEM_ID, "postgres")
        self.assertEqual(values["host"], "127.0.0.1")
        self.assertEqual(validate_api_url("http://127.0.0.1:54321"), "http://127.0.0.1:54321")

    def test_rejects_private_public_and_cloud_database_hosts(self):
        for host in ("10.1.2.3", "192.168.1.20", "172.20.0.2", "db.example.supabase.co", "localhost"):
            with self.subTest(host=host), self.assertRaises(LocalTargetError):
                validate_local_database(self.DSN.replace("127.0.0.1", host), self.SYSTEM_ID,
                                        "postgres")

    def test_rejects_wrong_database_port_and_missing_or_invalid_cluster_identity(self):
        cases = (
            (self.DSN.replace("54322", "5432"), self.SYSTEM_ID, "gch_v341_fixture"),
            (self.DSN.replace("postgres", "gch_v341_fixture"), self.SYSTEM_ID, "gch_v341_fixture"),
            (self.DSN, "", "postgres"),
            (self.DSN, "0", "postgres"),
            (self.DSN, "18446744073709551616", "postgres"),
        )
        for dsn, system_id, database in cases:
            with self.subTest(dsn=dsn, system_id=system_id), self.assertRaises(LocalTargetError):
                validate_local_database(dsn, system_id, database)
        with self.assertRaises(LocalTargetError):
            validate_local_database(self.DSN.replace("postgres", "other_db"),
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
                _conn(self.DSN, self.SYSTEM_ID, "postgres")
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

    def test_workflow_has_branch_scoped_temporary_push_and_dispatch(self):
        workflow = Path(".github/workflows/v341-local-supabase-e2e.yml").read_text(encoding="utf-8")
        trigger = workflow.split("permissions:", 1)[0]
        self.assertRegex(trigger, r"(?m)^on:\n  push:\n    branches:\n      - feature/v341-staging-reliability\n    paths:\n")
        self.assertIn("  workflow_dispatch:\n", trigger)
        self.assertNotRegex(trigger, r"(?m)^\s+(pull_request|schedule):")
        self.assertIn("      - .github/workflows/v341-local-supabase-e2e.yml", trigger)
        for path in (
            "tools/local_supabase_e2e.py", "tools/staging_fixture.py",
            "supabase/bootstrap.sql", "supabase/dashboard.sql",
            "supabase/migrations/0034_data_intelligence.sql",
            "supabase/migrations/0035_staging_reliability.sql",
            "dashboard/**", "requirements.txt", "tests/sql/**",
            "tests/test_local_supabase_e2e.py",
            "tests/test_staging.py",
            "tests/test_v341_docker_images.sh", "tools/v341_docker_images.sh",
        ):
            self.assertIn(f"      - {path}", trigger)
        self.assertNotIn("main", trigger)

    def test_workflow_is_pinned_local_only_and_secret_free(self):
        workflow = Path(".github/workflows/v341-local-supabase-e2e.yml").read_text(encoding="utf-8")
        self.assertIn("permissions:\n  contents: read", workflow)
        self.assertIn("persist-credentials: false", workflow)
        self.assertIn("version: 3.4.0", workflow)
        self.assertNotRegex(workflow, r"(?m)^\s+(?:image|kong_image)\s*=")
        self.assertRegex(workflow, r"(?m)^\s+\[auth\.email\]\n\s+enabled = true$")
        self.assertNotRegex(workflow, r"(?m)^\s+\[auth\.email\]\n\s+enable_signup\s*=")
        self.assertIn("supabase config validate", workflow)
        self.assertNotIn("secrets.", workflow)
        self.assertNotIn("supabase link", workflow)
        self.assertNotIn("supabase db push", workflow)
        self.assertNotIn("supabase.co", workflow)
        self.assertNotRegex(workflow, r"(?i)garmin|nas|production|prod_")
        for line in workflow.splitlines():
            if line.strip().startswith("uses:"):
                self.assertRegex(line.strip(), r"^uses: [^@]+@[0-9a-f]{40}(?:\s+#.*)?$")
        self.assertIn("python -m tools.local_supabase_e2e", workflow)
        self.assertNotIn("python tools/local_supabase_e2e.py", workflow)
        self.assertIn("pg_control_system()", workflow)
        self.assertIn("if: always()", workflow)
        self.assertIn('!= "$RUNNER_TEMP/gch-v341-supabase"', workflow)
        self.assertIn("com.docker.network.bridge.host_binding_ipv4=127.0.0.1", workflow)
        self.assertIn("com.gch.v341.e2e=true", workflow)
        self.assertIn('SUPABASE_NETWORK_ID="$GCH_SUPABASE_NETWORK_ID" SUPABASE_USE_SLIM_IMAGES=false', workflow)
        self.assertIn("-x realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit", workflow)
        self.assertIn("name: Inspect ephemeral service count and states", workflow)
        self.assertIn("name: Verify pinned service image tags", workflow)
        self.assertIn("name: Verify isolated network and loopback-only ports", workflow)
        self.assertIn("phase=startup category=%s exit_code=%s", workflow)
        self.assertIn("phase=container_inventory category=container_count_mismatch", workflow)
        self.assertIn("phase=image_tags category=image_tag_mismatch", workflow)
        self.assertIn("phase=network category=port_binding_invalid", workflow)
        self.assertNotIn("cat \"$log_file\"", workflow)
        self.assertNotIn("tee", workflow)
        self.assertIn("source tools/v341_docker_images.sh", workflow)
        self.assertIn("run: bash tests/test_v341_docker_images.sh", workflow)
        self.assertIn("docker_image_ref=%s", workflow)
        self.assertIn("category=malformed_image_reference", workflow)
        self.assertIn("phase=image_components service=postgrest registry_ok=%s repository_ok=%s tag_ok=%s", workflow)
        image_parser = Path("tools/v341_docker_images.sh").read_text(encoding="utf-8")
        self.assertIn("V341_DOCKER_REF_RE=", image_parser)
        self.assertIn("V341_IMAGE_REPOSITORY=\"${V341_IMAGE_REPOSITORY%:*}\"", image_parser)
        self.assertIn("V341_IMAGE_REGISTRY\" == public.ecr.aws", image_parser)
        self.assertIn("V341_IMAGE_REPOSITORY\" == supabase/postgrest", image_parser)
        self.assertIn("V341_IMAGE_TAG\" == v16.6", image_parser)
        self.assertIn("v341_count_postgrest_candidates", workflow + image_parser)
        self.assertNotIn("ghcr.io/supabase/postgrest:v16.6", workflow + image_parser)
        network_create = workflow.index('network_id="$(docker network create')
        network_export = workflow.index('echo "GCH_DOCKER_NETWORK_NAME=$network_name"')
        network_inspect = workflow.index('network_check="$(docker network inspect')
        self.assertLess(network_create, network_export)
        self.assertLess(network_export, network_inspect)
        self.assertIn("HostIp == \"127.0.0.1\"", workflow)
        self.assertIn("GCH_E2E_POSTGRES_CONTAINER_ID", workflow)
        self.assertNotIn("17.6.1.136", workflow)
        for image_tag in (
            "supabase/postgres:17.12.0.002", "supabase/gotrue:v2.198.0",
            "kong:2.8.1",
        ):
            self.assertIn(image_tag, workflow)
        harness = Path("tools/local_supabase_e2e.py").read_text(encoding="utf-8")
        fixture = Path("tools/staging_fixture.py").read_text(encoding="utf-8")
        self.assertIn('DB_NAME = "postgres"', harness)
        self.assertIn("local_supabase=True", harness)
        self.assertIn("local_supabase_target", fixture)
        browser_config = Path("dashboard/playwright.integration.config.ts").read_text(encoding="utf-8")
        browser_test = Path("dashboard/tests/supabase.integration.spec.ts").read_text(encoding="utf-8")
        self.assertIn("npm run preview", browser_config)
        self.assertNotIn("page.route", browser_config + browser_test)
        self.assertNotIn("route.fulfill", browser_config + browser_test)


if __name__ == "__main__":
    unittest.main()
