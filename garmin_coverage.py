"""Shared Garmin import and coverage transactions."""
from collections import Counter
from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from dataclasses import dataclass
from datetime import timedelta
from email.utils import parsedate_to_datetime
import json
import math
import os
import re
import time
from typing import Literal

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
ARCHIVE_LOCK = 340035
retry_count = ContextVar("retry_count", default=0)


@dataclass(frozen=True)
class Outcome:
    status: Literal["success", "partial", "failed", "no_measurement", "conflict"]
    saved: int = 0
    error: str | None = None
    missing: int = 0
    inserted: int = 0
    updated: int = 0
    moved: int = 0

    def __bool__(self):
        return self.status == "success"


class ImportJob:
    def __init__(self):
        self.counts = Counter()
        self.by_source = {source: Counter() for source in ALL_SOURCES}
        self.days = set()
        self.interrupted = False

    def add(self, day, source, outcome):
        self.days.add(day)
        for counts in (self.counts, self.by_source[source]):
            counts[outcome.status] += 1
            counts["saved"] += outcome.saved
            counts["not_returned"] += outcome.missing
            counts["inserted"] += outcome.inserted
            counts["updated"] += outcome.updated
            counts["moved"] += outcome.moved
            if outcome.error:
                counts["transient_errors" if outcome.error in TRANSIENT_ERRORS else "other_errors"] += 1

    def run(self, source, start, end, operation):
        token = retry_count.set(0)
        quota_exhausted = False
        try:
            result = operation()
        except Exception as exc:
            code = error_code(exc)
            for day in dates(start, end):
                self.add(day, source, Outcome("failed", error=code))
            if isinstance(exc, psycopg.Error):
                raise
            quota_exhausted = code == "http_429"
        else:
            for day, outcome in (result.items() if source == "activities" else [(start, result)]):
                self.add(day, source, outcome)
                quota_exhausted |= outcome.error == "http_429"
        finally:
            retries = retry_count.get()
            retry_count.reset(token)
            self.counts["retries"] += retries
            self.by_source[source]["retries"] += retries
        if quota_exhausted:
            raise QuotaExhausted()

    def finish(self):
        technical = self.interrupted or self.counts["failed"] or self.counts["conflict"]
        useful = any(self.counts[state] for state in ("success", "partial", "no_measurement", "conflict"))
        code = (2 if useful else 1) if technical else 0
        line = json.dumps({"exit_code": code, "days": len(self.days), "total": self.counts,
                           "sources": {key: counts for key, counts in self.by_source.items() if counts}},
                          sort_keys=True)
        print(line)
        if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(summary, "a", encoding="utf-8") as output:
                output.write(f"### Import Garmin\n\n```json\n{line}\n```\n")
        return code


TRANSIENT_ERRORS = {"network", *(f"http_{status}" for status in RETRIABLE)}


class SearchConflict(ValueError):
    """A paginated activity search changed or returned overlapping pages."""


class QuotaExhausted(RuntimeError):
    status_code = 429
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


def http_status(exc):
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(getattr(exc, "response", None), "status_code", None)
    return status if type(status) is int and 100 <= status <= 599 else None


def error_code(exc):
    if status := http_status(exc):
        return f"http_{status}"
    if isinstance(exc, SearchConflict):
        return "pagination_conflict"
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
            status = http_status(exc)
            if attempt == 3 or (status not in RETRIABLE and not isinstance(exc, (Timeout, ConnectionError))):
                raise
            delay = (10 if status == 429 else 2) * (2 ** attempt)
            headers = getattr(getattr(exc, "response", None), "headers", None) or {}
            supplied = headers.get("Retry-After")
            if supplied:
                try:
                    wait = int(supplied) if supplied.isdecimal() else parsedate_to_datetime(supplied).timestamp() - time.time()
                except (TypeError, ValueError, OverflowError):
                    wait = 0
                if wait > 120:
                    raise
                delay = max(delay, wait)
            retry_count.set(retry_count.get() + 1)
            sleep(delay)


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


def reliability_available(conn):
    return conn.execute("""
        SELECT EXISTS (SELECT FROM pg_catalog.pg_attribute
        WHERE attrelid = to_regclass('coaching.import_coverage')
          AND attname = 'reconciliation' AND NOT attisdropped)
        """).fetchone()[0]


def attest(conn, day, source, reconciliation, observed, missing=0):
    conn.execute("""
        UPDATE coaching.import_coverage
        SET reconciliation=%s, observed_count=%s, missing_count=%s
        WHERE day=%s AND source=%s
        """, (reconciliation, observed, missing, day, source))


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
    if not start <= end <= today or (end - start).days >= 31:
        raise ValueError("Intervallo attività non valido")
    days = dates(start, end)
    reliable = version == 34 and reliability_available(conn)
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
        observed = {day: set() for day in days}
        seen = set()
        incomplete = set()
        for activity_id, day, kind, wrapped in rows:
            if activity_id in seen:
                raise ValueError("ID attività duplicato")
            seen.add(activity_id)
            observed[day].add(activity_id)
            if reliable and kind in ("running", "trail_running") and not all(
                measurement(wrapped.obj, ("summary", field), *ACTIVITY_FIELDS["summary"][field])
                for field in ("distance", "duration")
            ):
                incomplete.add(day)
        outcomes = {}
        failure = "database"
        with conn.transaction():
            inserted, updated, moved = Counter(), Counter(), Counter()
            moved_days = set()
            if reliable:
                conn.execute("SELECT pg_advisory_xact_lock(%s)", (ARCHIVE_LOCK,))
            for activity_id, activity_date, activity_type, wrapped in rows:
                previous = conn.execute("SELECT raw_data, activity_date FROM coaching.garmin_activities WHERE activity_id=%s FOR UPDATE",
                                        (activity_id,)).fetchone()
                payload = wrapped.obj
                if previous:
                    updated[activity_date] += 1
                    if previous[1] != activity_date:
                        moved[activity_date] += 1
                        moved_days.update((activity_date, previous[1]))
                    specs = [((group, *(("summaryDTO",) if group == "detail" else ()), key), *bounds)
                             for group, fields in ACTIVITY_FIELDS.items() for key, bounds in fields.items()]
                    payload = keep_valid_fields(payload, previous[0], specs)
                else:
                    inserted[activity_date] += 1
                conn.execute("""
                    INSERT INTO coaching.garmin_activities (activity_id,activity_date,activity_type,raw_data)
                    VALUES (%s,%s,%s,%s)
                    ON CONFLICT (activity_id) DO UPDATE SET
                      activity_date=excluded.activity_date, activity_type=excluded.activity_type,
                      raw_data=excluded.raw_data, synced_at=now()
                    """, (activity_id, activity_date, activity_type, json_value(payload)))
            archived = {day: set() for day in days}
            if reliable:
                for day, activity_id in conn.execute("""
                    SELECT activity_date, activity_id FROM coaching.garmin_activities
                    WHERE activity_date BETWEEN %s AND %s
                    """, (start, end)):
                    archived[day].add(activity_id)
            for day in days:
                count = len(observed[day])
                mismatch = reliable and observed[day] != archived[day]
                missing = len(archived[day] - observed[day])
                state = ("partial" if day == today or day in incomplete
                         else "success_with_data" if count else "success_empty")
                if version == 34:
                    record(conn, day, "activities", state, count)
                if reliable:
                    concordance = ("conflict" if mismatch else "invalidated" if day in moved_days
                                   else "verified" if state != "partial" else None)
                    attest(conn, day, "activities", concordance, count, missing)
                conflict = mismatch or (reliable and day in moved_days)
                outcomes[day] = Outcome("conflict" if conflict else "partial" if state == "partial" else "success",
                                        count, missing=missing, inserted=inserted[day], updated=updated[day], moved=moved[day])
        return outcomes
    except Exception as exc:
        if version == 34:
            with conn.transaction():
                for day in days:
                    record(conn, day, "activities", "failed", error="db_write" if failure == "database" else error_code(exc))
        raise


def daily_import(conn, version, garmin, day, source, today):
    method, range_call, column, specs = SOURCES[source]
    reliable = version == 34 and reliability_available(conn)
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
        expected = list if source in ("body_battery", "stress") else dict
        if payload not in (None, {}, []) and not isinstance(payload, expected):
            raise ValueError("Formato giornaliero non valido")
        if (supplied_date is not None and supplied_date != day.isoformat()) or (
            range_call and entries is not None and (not isinstance(entries, list) or len(entries) > 1
                                                    or any(not isinstance(entry, dict) for entry in entries))
            and payload not in ({}, [])
        ):
            raise ValueError("Risposta giornaliera fuori intervallo")
        valid = validated_metrics(source, payload)
        complete = valid == len(specs)
        if valid:
            json_value(payload)
        db_write = True
        with conn.transaction():
            if reliable:
                conn.execute("SELECT pg_advisory_xact_lock(%s)", (ARCHIVE_LOCK,))
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
                if reliable and complete and day < today:
                    attest(conn, day, source, "verified", valid)
        status = "no_measurement" if not valid else "success" if complete and day < today else "partial"
        return Outcome(status, int(bool(valid)))
    except Exception as exc:
        if version == 34:
            with conn.transaction():
                record(conn, day, source, "failed", error="db_write" if db_write else error_code(exc))
        if db_write:
            raise
        return Outcome("failed", error=error_code(exc))


def repair_plan(conn, start, end):
    if not 0 <= (end - start).days < 31:
        raise ValueError("Intervallo di riparazione non valido")
    reconciliation = sql.SQL("AND reconciliation = 'verified'") if reliability_available(conn) else sql.SQL("")
    rows = conn.execute(sql.SQL("""
        SELECT day, source FROM coaching.import_coverage
        WHERE day BETWEEN %s AND %s AND evidence IS NOT NULL
              AND attempt_state IN ('success_with_data','success_empty')
        {}
        """).format(reconciliation), (start, end)).fetchall()
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
