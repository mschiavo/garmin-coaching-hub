from datetime import date
from unittest import TestCase
from unittest.mock import Mock, patch

from garmin_coverage import SOURCES, dates, retry, validated_metrics
from sync_garmin import fetch_activities, fetch_activity_details
import repair_garmin

DAY = date(2024, 2, 29)
SAMPLES = {
    "sleep": {"sleepTimeSeconds": 27000},
    "hrv": {"hrvSummary": {"lastNightAvg": 52}},
    "body_battery": [{"charged": 0, "drained": 49}],
    "stress": [{"values": {"overallStressLevel": 0}}],
    "daily_summary": {"data": [{"heartRate": {"restingValue": 58}, "movement": {"steps": {"value": 0}}}]},
}


class HttpError(Exception):
    def __init__(self, status):
        self.status_code = status


def activity(i, day="2024-02-29T10:00:00"):
    return {"activityId": i, "startTimeLocal": day, "activityType": {"typeKey": "running"}}


class GarminCoverageTests(TestCase):
    def test_empty_and_paginated_search(self):
        garmin = Mock()
        garmin.search_activities.return_value = []
        self.assertEqual(fetch_activities(garmin, DAY, DAY), [])
        garmin.search_activities.side_effect = [[activity(i) for i in range(1, 51)], [activity(51)]]
        self.assertEqual(len(fetch_activities(garmin, DAY, DAY)), 51)
        self.assertEqual(garmin.search_activities.call_args.kwargs["start"], 50)
        garmin.search_activities.side_effect = None
        garmin.search_activities.return_value = [activity(1)] * 50
        with self.assertRaisesRegex(ValueError, "Limite"):
            fetch_activities(garmin, DAY, DAY)
        self.assertEqual(garmin.search_activities.call_args.kwargs["start"], 4950)

    def test_detail_validation_and_deduplication(self):
        garmin = Mock()
        garmin.get_activity.return_value = {"synthetic": True}
        rows = fetch_activity_details(garmin, [activity(9007199254740993), activity(9007199254740993), activity(2)])
        self.assertEqual([(row[0],row[1]) for row in rows], [(9007199254740993, DAY), (2, DAY)])
        self.assertEqual(garmin.get_activity.call_count, 2)
        for fixture in (activity(0), activity(1.5), activity(4, "2024-02-30T09:00:00"), activity(5, None)):
            with self.assertRaises(ValueError):
                fetch_activity_details(garmin, [fixture])
        with self.assertRaises(ValueError):
            fetch_activity_details(garmin, [activity(7), activity(7, "2024-02-28T09:00:00")])
        garmin.get_activity.return_value = {}
        with self.assertRaises(ValueError):
            fetch_activity_details(garmin, [activity(8)])

    def test_retry_is_bounded_and_preserves_auth_errors(self):
        for status, delays in [(401, []), (403, []), (429, [10,20,40]), (503, [2,4,8])]:
            with self.subTest(status=status):
                operation = Mock(side_effect=HttpError(status))
                observed = []
                with self.assertRaises(HttpError):
                    retry(operation, sleep=observed.append)
                self.assertEqual(observed, delays)
                self.assertEqual(operation.call_count, len(delays) + 1)

    def test_five_sources_and_empty_values(self):
        for source, payload in SAMPLES.items():
            with self.subTest(source=source):
                self.assertEqual(validated_metrics(source, payload), len(SOURCES[source][3]))
                for no_data in (None, [], {}, 'null', False):
                    self.assertEqual(validated_metrics(source, no_data), 0)

    def test_dry_run_never_calls_garmin_or_writer(self):
        with patch.object(repair_garmin.sys, "argv", ["repair_garmin.py", "2024-02-29", "2024-02-29"]), \
             patch.object(repair_garmin.psycopg, "connect") as connect, \
             patch.object(repair_garmin, "authenticate_garmin") as authenticate, \
             patch.object(repair_garmin, "writer") as writer, \
             patch.object(repair_garmin, "fail_if_missing_env", return_value="synthetic"), \
             patch.object(repair_garmin, "plan", return_value=[(DAY,"sleep")]), patch("builtins.print") as output:
            repair_garmin.main()
        self.assertTrue(connect.return_value.__enter__.return_value.read_only)
        authenticate.assert_not_called()
        writer.assert_not_called()
        self.assertIn('"source": "sleep"', output.call_args.args[0])

    def test_calendar_range_across_leap_day(self):
        self.assertEqual([value.isoformat() for value in dates(date(2024,2,28), date(2024,3,1))],
                         ["2024-02-28","2024-02-29","2024-03-01"])
