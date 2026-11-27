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

    def test_workflow_is_manual_only_and_minimally_privileged(self):
        self.assertRegex(self.source, r"(?m)^on:\s*\n\s+workflow_dispatch:\s*$")
        self.assertNotRegex(self.source, r"(?m)^\s+(push|pull_request|schedule|workflow_call):")
        self.assertRegex(self.source, r"(?m)^permissions:\s*\n\s+contents:\s*read\s*$")
        self.assertNotRegex(self.source, r"(?m)^\s+(id-token|pages|packages|actions):\s*(write|read)")
        self.assertNotRegex(self.source, r"(?m)^\s+continue-on-error:\s*true\s*$")
        self.assertNotIn("|| true", self.source)
        self.assertNotIn("|| :", self.source)
        self.assertRegex(self.source, r"persist-credentials:\s*false")
        self.assertNotRegex(self.source, r"`\s*\$GITHUB_SHA\s*`")

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
            "PlanningSchema", "PlanningRestore", "if: always()", "${GITHUB_SHA}", "$GITHUB_STEP_SUMMARY",
        ):
            self.assertIn(required, self.source)
        self.assertRegex(self.source, r"(?m)^\s+id: cleanup\s*$")
        self.assertRegex(self.source, r"(?m)^\s+id: restore-tests\s*$")


if __name__ == "__main__":
    unittest.main(verbosity=2)
