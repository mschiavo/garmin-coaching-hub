"""Fail-closed checks for the V4.1 local Supabase RPC E2E workflow."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/v41-planning-rpc-e2e.yml"
HARNESS = ROOT / "tools/local_supabase_planning_e2e.py"


class PlanningE2ESafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.harness = HARNESS.read_text(encoding="utf-8")

    def test_workflow_is_branch_scoped_and_least_privileged(self):
        trigger = re.search(r"(?ms)^on:\s*\n(.*?)(?=^permissions:)", self.workflow)
        self.assertIsNotNone(trigger)
        source = trigger.group(1)
        self.assertIn("workflow_dispatch:", source)
        self.assertRegex(source, r"(?ms)^  push:\s*\n\s+branches:\s*\n\s+- feature/v4-visual-foundation")
        self.assertIn("feature/v4-visual-foundation", source)
        self.assertNotIn("pull_request", source)
        self.assertNotIn("schedule:", source)
        self.assertRegex(self.workflow, r"(?m)^permissions:\s*\n\s+contents:\s*read\s*$")
        self.assertIn("persist-credentials: false", self.workflow)
        self.assertIn("ref: ${{ github.sha }}", self.workflow)
        self.assertIn("if: github.ref != 'refs/heads/main'", self.workflow)

    def test_stack_is_pinned_local_and_cleaned_always(self):
        for pinned in (
            "ubuntu-24.04", "python-version: '3.12.8'", "version: 3.4.0",
            "psycopg[binary]==3.2.6", "requests==2.32.3", "public.ecr.aws/supabase/postgres:17.12.0.002",
            "public.ecr.aws/supabase/gotrue:v2.198.0", "public.ecr.aws/supabase/postgrest:v16.6",
            "kong:2.8.1", "127.0.0.1", "python -m tools.local_supabase_planning_e2e",
        ):
            self.assertIn(pinned, self.workflow)
        self.assertRegex(self.workflow, r"(?m)^\s+if: always\(\)\s*$")
        self.assertIn("cleanup_failed=0", self.workflow)
        self.assertIn("category=failed", self.workflow)
        self.assertIn("com.docker.network.bridge.host_binding_ipv4=127.0.0.1", self.workflow)
        self.assertIn("env -u SUPABASE_INTERNAL_IMAGE_REGISTRY", self.workflow)
        self.assertIn('test "${#ids[@]}" -eq 4', self.workflow)
        self.assertNotRegex(self.workflow, r"\$\{\{\s*secrets\.")
        for forbidden in ("supabase link", "supabase db push", "supabase.co", "GARMIN_", "NAS_", "service_role"):
            self.assertNotIn(forbidden.lower(), self.workflow.lower())

    def test_cli_340_exact_registry_fallbacks_are_allowlisted(self):
        # Supabase CLI 3.4.0 resolves each upstream Dockerfile image through, in order,
        # the public ECR mirror, the Supabase GHCR mirror, then its source registry ref.
        # Every accepted ref therefore keeps the same exact manifest tag.
        refs = (
            "public.ecr.aws/supabase/postgres:17.12.0.002",
            "ghcr.io/supabase/postgres:17.12.0.002",
            "supabase/postgres:17.12.0.002",
            "public.ecr.aws/supabase/gotrue:v2.198.0",
            "ghcr.io/supabase/gotrue:v2.198.0",
            "supabase/gotrue:v2.198.0",
            "public.ecr.aws/supabase/postgrest:v16.6",
            "ghcr.io/supabase/postgrest:v16.6",
            "postgrest/postgrest:v16.6",
            "public.ecr.aws/supabase/kong:2.8.1",
            "ghcr.io/supabase/kong:2.8.1",
            "library/kong:2.8.1",
        )
        case_refs = re.findall(
            r"(?m)^\s+([^\n]+)\) (?:postgres_ok|auth_ok|rest_ok|kong_ok)=",
            self.workflow,
        )
        allowed = {ref for case in case_refs for ref in case.split("|")}
        self.assertEqual(set(refs), allowed)

    def test_unexpected_image_diagnostic_is_sanitized_and_fail_closed(self):
        step = re.search(
            r"(?ms)^      - name: Verify container identity, fixed images, isolated network and loopback ports\n(.*?)(?=^      - name:)",
            self.workflow,
        )
        self.assertIsNotNone(step)
        source = step.group(1)
        self.assertIn("docker inspect --format '{{.Config.Image}}'", source)
        self.assertIn("log_safe_image_ref \"$image\" || exit 1", source)
        self.assertIn("category=malformed_image_reference image_ref=redacted", source)
        self.assertIn("^v?[0-9]+([._-][A-Za-z0-9]+)*$", source)
        self.assertIn("category=image_observed slot=%s registry=%s repository=%s version=%s", source)
        self.assertIn("category=unexpected_image slot=%s; image_ref_logged_above=true", source)
        self.assertLess(source.index("log_safe_image_ref \"$image\""), source.index("case \"$image\" in"))
        # The diagnostic emits only parsed fields, never the raw .Config.Image or container env.
        self.assertNotIn('printf "%s" "$ref"', source)
        self.assertNotIn(".Config.Env", source)
        self.assertNotIn("docker inspect", source[source.index("log_safe_image_ref()") : source.index("for id in")])

    def test_harness_restricts_local_identity_and_uses_ordered_migrations(self):
        for safe_check in (
            'API_URL_EXPECTED = "http://127.0.0.1:54331"', "DB_PORT_EXPECTED = 54332",
            'dsn.hostname != "127.0.0.1"', 'dsn.path != "/postgres"',
            'SELECT system_identifier::text FROM pg_catalog.pg_control_system()',
            "fixture_sql(date.today(), False, database=\"postgres\", system_id=expected_id",
            '"supabase/migrations/0036_v41_planning.sql"',
            '"supabase/migrations/0037_v41_planning_rpc.sql"',
            '"/auth/v1/logout"', '"planning_update_cycle_v1"', '"planning_get_cycle_v1"',
        ):
            self.assertIn(safe_check, self.harness)
        self.assertNotIn("supabase.co", self.harness)
        self.assertNotIn("GARMIN_", self.harness)
        self.assertNotIn("service_role", self.harness)


if __name__ == "__main__":
    unittest.main(verbosity=2)
