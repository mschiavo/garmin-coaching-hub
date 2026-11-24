from unittest import TestCase
from unittest.mock import Mock, patch

from tools.staging_operations import FILES, OperationError, backup, install


class StagingOperationsTests(TestCase):
    def test_install_requires_expected_schema_and_rechecks_marker_for_each_file(self):
        ref = "a" * 20
        conn = Mock()
        conn.execute.return_value.fetchone.return_value = (True, True, False, False, False)
        with self.assertRaises(OperationError):
            install(conn, ref, "Fresh")
        self.assertEqual(conn.execute.call_count, 1)
        conn.reset_mock()
        conn.execute.return_value.fetchone.return_value = (False,) * 5
        with patch("tools.staging_operations.marker_query") as marker, patch("builtins.print"):
            install(conn, ref, "Fresh")
        self.assertEqual(marker.call_count, len(FILES["Fresh"]))
        self.assertEqual(conn.execute.call_count, 1 + len(FILES["Fresh"]))

    def test_backup_client_receives_only_scoped_database_environment(self):
        with patch.dict("os.environ", {"PGHOSTADDR": "192.0.2.1", "GCH_STAGING_ALLOWED_PASSWORD": "synthetic-auth"}), \
             patch("tools.staging_operations.subprocess.run", return_value=Mock(returncode=0)) as run:
            backup({"host": "db.example.invalid", "password": "synthetic-db"}, Mock(), "pg_dump")
        args, kwargs = run.call_args
        self.assertNotIn("synthetic-db", args[0])
        self.assertIn("--exclude-table-data=dashboard_private.staging_identity", args[0])
        self.assertEqual(kwargs["env"]["PGPASSWORD"], "synthetic-db")
        self.assertNotIn("PGHOSTADDR", kwargs["env"])
        self.assertNotIn("GCH_STAGING_ALLOWED_PASSWORD", kwargs["env"])
