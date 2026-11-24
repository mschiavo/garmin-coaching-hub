"""Shared Garmin import and coverage transactions."""
from collections import Counter
from contextlib import contextmanager
from copy import deepcopy
from datetime import timedelta
import json
import math
import re
import time

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb
from requests import ConnectionError, Timeout

SOURCES = {
    "sleep": ("get_daily_sleep", False, "sleep_data", [(("sleepTimeSeconds",), 1, 86400)]),
    "hrv": ("get_daily_hrv", False, "hrv_data", [(("hrvSummary", "lastNightAvg"), 1, 500)]),
    "body_battery": ("get_daily_body_battery", True, "body_battery_data",
                     [((0, "charged"), 0, 1000), ((0, "drained"), 0, 1000)]),
    "stress": ("get_daily_stress", True, "stress_data", [((0, "values", "overallStressLevel"), 0, 100)]),
    "daily_summary": ("get_daily_summaries", True, "daily_summary",
                      [(("data", 0, "heartRate", "restingValue"), 20, 250),
                       (("data", 0, "movement", "steps", "value"), 0, 200000)]),
}
ALL_SOURCES = ("activities", *SOURCES)
RETRIABLE = {408, 429, 500, 502, 503, 504}
LOCK = 340034
ACTIVITY_FIELDS = {
    "summary": {
        "distance": (0.001, 10000000), "duration": (0.001, 864000), "averageHR": (20, 250),
        "elevationGain": (0, 60000), "elevationLoss": (0, 60000),
        "averageRunningCadenceInStepsPerMinute": (1, 300), "fastestSplit_1000": (60, 86400),
        **{f"hrTimeInZone_{i}": (0, 864000) for i in range(1, 6)},
    },
    "detail": {
        "elevationGain": (0, 60000), "elevationLoss": (0, 60000),
        "averageRunCadence": (1, 300), "averagePower": (0, 4000), "averageTemperature": (-90, 70),
    },
}


def dates(start, end):
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def error_code(exc):
    status = getattr(exc, "status_code", None)
    if type(status) is int and 100 <= status <= 599:
        return f"http_{status}"
    if isinstance(exc, (Timeout, ConnectionError)):
        return "network"
    if isinstance(exc, (TypeError, ValueError)):
        return "invalid_payload"
    return "operation_failed"


def retry(operation, *, sleep=time.sleep):
    for attempt in range(4):
        try:
            return operation()
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if attempt == 3 or (status not in RETRIABLE and not isinstance(exc, (Timeout, ConnectionError))):
                raise
            # The pinned client exposes the status but discards response headers.
            sleep((10 if status == 429 else 2) * (2 ** attempt))


def at_path(payload, path):
    try:
        for key in path:
            payload = payload[key]
    except (TypeError, IndexError, KeyError):
        return None
    return payload


def measurement(payload, path, low, high):
    payload = at_path(payload, path)
    if isinstance(payload, str) and re.fullmatch(r"-?[0-9]{1,12}(\.[0-9]{1,10})?", payload):
        payload = float(payload)
    return type(payload) in (int, float) and low <= payload <= high and math.isfinite(payload)


def keep_valid_fields(payload, prior, specs):
    """Backfill only allowlisted scalar paths. The incoming response owns every other field."""
    result = deepcopy(payload)
    for path, low, high in specs:
        if measurement(result, path, low, high) or not measurement(prior, path, low, high):
            continue
        target = result
        for index, key in enumerate(path[:-1]):
            expected = list if isinstance(path[index + 1], int) else dict
            child = at_path(target, (key,))
            if not isinstance(child, expected):
                child = [{}] if expected is list else {}
                target[key] = child
            if expected is list and not child:
                child.append({})
            target = child
        target[path[-1]] = at_path(prior, path)
    return result


def validated_metrics(source, payload):
    return sum(measurement(payload, *spec) for spec in SOURCES[source][3])


def json_value(payload):
    json.dumps(payload, allow_nan=False)
    return Jsonb(payload)


def schema_version(conn):
    with conn.transaction():
        if conn.execute("SELECT to_regclass('coaching.intelligence_state')").fetchone()[0] is None:
            return 33
        version = conn.execute("SELECT schema_version FROM coaching.intelligence_state WHERE singleton").fetchone()
        if version != (34,):
            raise RuntimeError("Versione schema inattesa")
        return version[0]


@contextmanager
def writer(database_url):
    with psycopg.connect(database_url, sslmode="require", connect_timeout=15, autocommit=True) as conn:
        if not conn.execute("SELECT pg_try_advisory_lock(%s)", (LOCK,)).fetchone()[0]:
            raise RuntimeError("Import già in corso")
        yield conn, schema_version(conn)


def record(conn, day, source, state, count=None, error=None):
    evidence = state if state in ("success_with_data", "success_empty") else None
    quality = {"success_with_data": "validated", "success_empty": "source_empty"}.get(evidence)
    conn.execute("""
        INSERT INTO coaching.import_coverage AS previous
          (day, source, attempt_state, attempted_at, evidence, succeeded_at, item_count, quality, error_code)
        VALUES (%s, %s, %s, clock_timestamp(), %s, CASE WHEN %s THEN clock_timestamp() END, %s, %s, %s)
        ON CONFLICT (day, source) DO UPDATE SET
          attempt_state = excluded.attempt_state, attempted_at = excluded.attempted_at,
          evidence = coalesce(excluded.evidence, previous.evidence),
          succeeded_at = coalesce(excluded.succeeded_at, previous.succeeded_at),
          item_count = coalesce(excluded.item_count, previous.item_count),
          quality = coalesce(excluded.quality, previous.quality),
          error_code = excluded.error_code
        """, (day, source, state, evidence, evidence is not None, count if evidence else None, quality, error))


def activity_import(conn, version, garmin, start, end, today, search, details):
    days = dates(start, end)
    if version == 34:
        with conn.transaction():
            for day in days:
                record(conn, day, "activities", "partial")
    failure = "database"
    try:
        failure = "source"
        activities = search(garmin, start, end)
        rows = details(garmin, activities)
        if any(not start <= row[1] <= end for row in rows):
            raise ValueError("Data attività fuori intervallo")
        counts = Counter(row[1] for row in rows)
        failure = "database"
        with conn.transaction():
            for activity_id, activity_date, activity_type, wrapped in rows:
                previous = conn.execute("SELECT raw_data FROM coaching.garmin_activities WHERE activity_id=%s FOR UPDATE",
                                        (activity_id,)).fetchone()
                payload = wrapped.obj
                if previous:
                    specs = [((group, *(("summaryDTO",) if group == "detail" else ()), key), *bounds)
                             for group, fields in ACTIVITY_FIELDS.items() for key, bounds in fields.items()]
                    payload = keep_valid_fields(payload, previous[0], specs)
                conn.execute("""
                    INSERT INTO coaching.garmin_activities (activity_id,activity_date,activity_type,raw_data)
                    VALUES (%s,%s,%s,%s)
                    ON CONFLICT (activity_id) DO UPDATE SET
                      activity_date=excluded.activity_date, activity_type=excluded.activity_type,
                      raw_data=excluded.raw_data, synced_at=now()
                    """, (activity_id, activity_date, activity_type, json_value(payload)))
            if version == 34:
                for day in days:
                    count = counts[day]
                    state = "partial" if day == today else "success_with_data" if count else "success_empty"
                    record(conn, day, "activities", state, count)
    except Exception as exc:
        if version == 34:
            with conn.transaction():
                for day in days:
                    record(conn, day, "activities", "failed", error="db_write" if failure == "database" else error_code(exc))
        raise


def daily_import(conn, version, garmin, day, source, today):
    method, range_call, column, specs = SOURCES[source]
    if version == 34:
        with conn.transaction():
            record(conn, day, source, "partial")
    db_write = False
    try:
        args = (day.isoformat(),) * (2 if range_call else 1)
        payload = retry(lambda: getattr(garmin, method)(*args))
        date_path = {
            "sleep": ("calendarDate",), "hrv": ("hrvSummary", "calendarDate"),
            "body_battery": (0, "date"), "stress": (0, "calendarDate"),
            "daily_summary": ("data", 0, "calendarDate"),
        }[source]
        supplied_date = at_path(payload, date_path)
        entries = at_path(payload, ("data",)) if source == "daily_summary" else payload
        if (supplied_date is not None and supplied_date != day.isoformat()) or (range_call and isinstance(entries, list) and len(entries) > 1):
            raise ValueError("Risposta giornaliera fuori intervallo")
        valid = validated_metrics(source, payload)
        complete = valid == len(specs)
        if valid:
            json_value(payload)
        db_write = True
        with conn.transaction():
            if valid:
                field = sql.Identifier(column)
                previous = conn.execute(sql.SQL("""
                    SELECT {field} FROM coaching.garmin_daily_metrics WHERE metric_date=%s FOR UPDATE
                    """).format(field=field), (day,)).fetchone()
                if previous and not complete:
                    payload = keep_valid_fields(payload, previous[0], specs)
                conn.execute(sql.SQL("""
                    INSERT INTO coaching.garmin_daily_metrics (metric_date,{field})
                    VALUES (%s,%s)
                    ON CONFLICT (metric_date) DO UPDATE SET {field}=excluded.{field}, synced_at=now()
                    """).format(field=field), (day, json_value(payload)))
            if version == 34:
                state = "success_with_data" if complete and day < today else "partial"
                record(conn, day, source, state, valid, None if valid else "no_valid_measurement")
        return complete
    except Exception as exc:
        if version == 34:
            with conn.transaction():
                record(conn, day, source, "failed", error="db_write" if db_write else error_code(exc))
        if db_write:
            raise
        return False


def repair_plan(conn, start, end):
    rows = conn.execute("""
        SELECT day, source FROM coaching.import_coverage
        WHERE day BETWEEN %s AND %s AND evidence IS NOT NULL
              AND attempt_state IN ('success_with_data','success_empty')
        """, (start, end)).fetchall()
    complete = set(rows)
    return [(day, source) for day in dates(start, end) for source in ALL_SOURCES if (day, source) not in complete]


def legacy_plan(conn, start, end):
    rows = conn.execute("""
        SELECT metric_date,sleep_data,hrv_data,body_battery_data,stress_data,daily_summary
        FROM coaching.garmin_daily_metrics WHERE metric_date BETWEEN %s AND %s
        """, (start, end)).fetchall()
    valid = {(day, source) for day, *values in rows for source, payload in zip(SOURCES, values)
             if validated_metrics(source, payload) == len(SOURCES[source][3])}
    return [(day, source) for day in dates(start, end) for source in SOURCES if (day, source) not in valid]
