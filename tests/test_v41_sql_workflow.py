"""Static safety regression checks for the local-only V4.1 SQL gate workflow."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/v41-planning-sql-gate.yml"


class WorkflowSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = WORKFLOW.read_text(encoding="utf-8")

    def test_push_trigger_is_limited_to_the_v41_gate_files_and_branch(self):
        trigger = re.search(r"(?ms)^on:\s*\n(.*?)(?=^permissions:)" , self.source)
        self.assertIsNotNone(trigger)
        trigger_source = trigger.group(1)
        events = re.findall(r"(?m)^  ([a-z_]+):\s*$", trigger_source)
        self.assertEqual(events, ["push", "workflow_dispatch"])
        push = re.search(r"(?ms)^  push:\s*\n(.*?)(?=^  workflow_dispatch:)", trigger_source)
        self.assertIsNotNone(push)
        branches = re.search(r"(?m)^    branches:[ \t]*\r?\n((?:      - [^\r\n]+\r?\n)+)", push.group(1))
        paths = re.search(r"(?m)^    paths:[ \t]*\r?\n((?:      - [^\r\n]+\r?\n)+)", push.group(1))
        self.assertIsNotNone(branches)
        self.assertIsNotNone(paths)
        self.assertEqual(re.findall(r"(?m)^      - (.+)$", branches.group(1)), ["feature/v4-visual-foundation"])
        expected_paths = {
            ".github/workflows/v41-planning-sql-gate.yml",
            "supabase/bootstrap.sql",
            "supabase/dashboard.sql",
            "supabase/migrations/0034_data_intelligence.sql",
            "supabase/migrations/0035_staging_reliability.sql",
            "supabase/migrations/0036_v41_planning.sql",
            "supabase/migrations/0037_v41_planning_rpc.sql",
            "tests/sql/auth_stub.sql",
            "tests/sql/v41_planning_contract.py",
            "tests/test_v41_sql_workflow.py",
            "tests/test_v41_planning_rpc_contract.py",
        }
        actual_paths = set(re.findall(r"(?m)^      - (.+)$", paths.group(1)))
        self.assertEqual(actual_paths, expected_paths)
        self.assertFalse(any(any(char in path for char in "*?[]") for path in actual_paths))
        for forbidden in ("main", "feature/v3", "pull_request", "workflow_run", "schedule"):
            self.assertNotIn(forbidden, trigger_source)

    def test_workflow_is_minimally_privileged_and_checkout_is_event_sha(self):
        self.assertRegex(self.source, r"(?m)^permissions:\s*\n\s+contents:\s*read\s*$")
        self.assertNotRegex(self.source, r"(?m)^\s+(contents|id-token|pages|packages|actions):\s*write\s*$")
        self.assertNotRegex(self.source, r"(?m)^\s+continue-on-error:\s*true\s*$")
        self.assertNotIn("|| true", self.source)
        self.assertNotIn("|| :", self.source)
        self.assertIn("ref: ${{ github.sha }}", self.source)
        self.assertRegex(self.source, r"persist-credentials:\s*false")
        self.assertNotRegex(self.source, r"`\s*\$GITHUB_SHA\s*`")
        self.assertRegex(self.source, r"(?m)^\s+cancel-in-progress:\s*false\s*$")
        self.assertRegex(self.source, r"(?m)^\s+timeout-minutes:\s*25\s*$")
        self.assertNotRegex(self.source, r"(?i)curl\s+[^\n]*\|\s*(sh|bash)")
        self.assertNotRegex(self.source, r"(?i)\b(latest|supabase\s+link|supabase\s+db\s+push|deploy)\b")

    def test_cleanup_runs_always_and_restore_checks_constraints_and_data(self):
        self.assertRegex(self.source, r"(?ms)^\s+id: cleanup\s*\n\s+if: always\(\)")
        sql_contract = (ROOT / "tests/sql/v41_planning_contract.py").read_text(encoding="utf-8")
        for required in (
            "pg_get_constraintdef", "pg_catalog.pg_indexes", "pg_get_triggerdef", "row_counts(restored)",
            "restored_activity, source_activity", "errors.CheckViolation",
        ):
            self.assertIn(required, sql_contract)

    def test_only_fixed_local_postgres_and_synthetic_credentials_are_configured(self):
        self.assertIn("runs-on: ubuntu-24.04", self.source)
        self.assertIn("image: postgres:17.6", self.source)
        self.assertIn("python-version: '3.12.10'", self.source)
        self.assertIn("psycopg[binary]==3.2.6", self.source)
        self.assertIn("host=127.0.0.1", self.source)
        self.assertRegex(self.source, r"(?m)^\s+- 127\.0\.0\.1:5432:5432\s*$")
        self.assertIn("v41-synthetic-only", self.source)
        self.assertNotRegex(self.source, r"\$\{\{\s*secrets\.")
        self.assertNotRegex(self.source, r"https?://")
        for forbidden in ("GARMIN_", "SUPABASE_URL", "supabase.co", "service_role"):
            self.assertNotIn(forbidden.lower(), self.source.lower())
        self.assertNotRegex(self.source, r"db\.[a-z0-9]{20}\.supabase\.co")

    def test_required_sql_restore_report_and_cleanup_gates_are_mandatory(self):
        for required in (
            "gch_v41_planning_fresh", "gch_v41_planning_upgrade", "gch_v41_planning_atomic",
            "gch_v41_planning_restore", "pg_dump", "pg_restore", "--exit-on-error",
            "PlanningSchema", "PlanningRPC", "PlanningRestore", "if: always()", "${GITHUB_SHA}", "$GITHUB_STEP_SUMMARY",
        ):
            self.assertIn(required, self.source)
        self.assertRegex(self.source, r"(?m)^\s+id: restore-tests\s*$")


if __name__ == "__main__":
    unittest.main(verbosity=2)
