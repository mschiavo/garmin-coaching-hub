from datetime import date
from unittest import TestCase
from unittest.mock import Mock, patch

from tools.staging_fixture import fixture_sql, marker_query, staging_connection
from tools.staging_probe import probe

REF = "a" * 20
PRODUCTION = "b" * 20
DSN = f"host=db.{REF}.supabase.co dbname=postgres user=synthetic password=synthetic sslmode=verify-full sslrootcert=system"
ENV = {
    "GCH_TARGET": "staging",
    "GCH_STAGING_PROJECT_REF": REF,
    "GCH_PRODUCTION_PROJECT_REF": PRODUCTION,
    "GCH_STAGING_SUPABASE_URL": f"https://{REF}.supabase.co",
    "GCH_STAGING_DATABASE_URL": DSN,
}


class StagingTests(TestCase):
    def test_target_requires_explicit_distinct_verified_identity(self):
        self.assertEqual(staging_connection(ENV)[0], REF)
        for environment in (
            {},
            ENV | {"GCH_TARGET": "production"},
            ENV | {"GCH_PRODUCTION_PROJECT_REF": REF},
            ENV | {"GCH_STAGING_SUPABASE_URL": f"https://{PRODUCTION}.supabase.co"},
            ENV | {"GCH_STAGING_SUPABASE_URL": f"https://{REF}.supabase.co@other.invalid"},
            ENV | {"GCH_STAGING_DATABASE_URL": DSN.replace(f"db.{REF}.supabase.co", "pooler.supabase.com")},
            ENV | {"GCH_STAGING_DATABASE_URL": DSN + " hostaddr=127.0.0.1"},
            ENV | {"GCH_STAGING_DATABASE_URL": DSN.replace("verify-full", "require")},
            ENV | {"GCH_STAGING_DATABASE_URL": "", "SUPABASE_DATABASE_URL": DSN},
            ENV | {"PGSERVICE": "other"},
        ):
            with self.subTest(environment=list(environment)):
                with self.assertRaises(ValueError):
                    staging_connection(environment)

    def test_marker_must_match_and_be_singleton(self):
        conn = Mock()
        for rows in ([], [(PRODUCTION,)], [(REF,), (REF,)]):
            conn.execute.return_value.fetchall.return_value = rows
            with self.assertRaises(ValueError):
                marker_query(conn, REF)
        conn.execute.return_value.fetchall.return_value = [(REF,)]
        marker_query(conn, REF)

    def test_reproducible_fixture_and_guards(self):
        day = date(2024, 3, 5)
        small = fixture_sql(day, False)
        large = fixture_sql(day, True)
        self.assertEqual(large, fixture_sql(day, True))
        self.assertNotEqual(small, large)
        self.assertIn("generate_series(0,2500)", large)
        self.assertIn("inet_server_addr()", large)
        self.assertIn("staging_identity", fixture_sql(day, False, REF))
        self.assertNotIn("import_coverage", fixture_sql(day, False, legacy=True))
        with self.assertRaises(ValueError):
            fixture_sql(day, False, "staging';")

    def test_probe_rejects_secret_key_and_stops_on_marker_before_http(self):
        env = ENV | {
            "GCH_STAGING_ALLOWED_EMAIL": "allowed@example.invalid",
            "GCH_STAGING_DENIED_EMAIL": "denied@example.invalid",
            "GCH_STAGING_ALLOWED_PASSWORD": "synthetic",
            "GCH_STAGING_DENIED_PASSWORD": "synthetic",
        }
        with patch("tools.staging_probe.psycopg.connect") as connect, patch("tools.staging_probe.requests.Session") as http:
            with self.assertRaises(ValueError):
                probe(env | {"GCH_STAGING_SUPABASE_PUBLISHABLE_KEY": "sb_secret_synthetic"})
            connect.assert_not_called()
            conn = connect.return_value.__enter__.return_value
            conn.execute.return_value.fetchall.return_value = [(PRODUCTION,)]
            with self.assertRaises(ValueError):
                probe(env | {"GCH_STAGING_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_synthetic"})
            self.assertTrue(conn.read_only)
            http.assert_not_called()
