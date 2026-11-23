"""Unit tests without Garmin credentials, database, or third-party dependencies."""
import ast
from datetime import date, datetime
from pathlib import Path
import unittest
from zoneinfo import ZoneInfo
import calendar

ROOT = Path(__file__).resolve().parents[1]

class CommunityTests(unittest.TestCase):
    def test_history_month_range(self):
        source = (ROOT / 'import_garmin_history.py').read_text(encoding='utf-8')
        tree = ast.parse(source)
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'get_month_range')
        scope = {'date': date, 'datetime': datetime, 'calendar': calendar, 'TIMEZONE': ZoneInfo('Europe/Rome')}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), '<get_month_range>', 'exec'), scope)
        get_range = scope['get_month_range']
        self.assertEqual(get_range('2024-02'), (date(2024, 2, 1), date(2024, 2, 29)))
        self.assertEqual(get_range('2025-09'), (date(2025, 9, 1), date(2025, 9, 30)))
        for value in ('2026-00', '2026-13', '2026-1', 'abcd-01', '9999-12'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                get_range(value)

    def test_timezone_configurable(self):
        for name in ('sync_garmin.py', 'import_garmin_history.py'):
            source = (ROOT / name).read_text(encoding='utf-8')
            self.assertIn('os.environ.get("GARMIN_TIMEZONE", "Europe/Rome")', source)

    def test_bootstrap_contains_required_tables(self):
        source = (ROOT / 'supabase/bootstrap.sql').read_text(encoding='utf-8')
        self.assertIn('coaching.garmin_activities', source)
        self.assertIn('coaching.garmin_daily_metrics', source)

if __name__ == '__main__':
    unittest.main()
