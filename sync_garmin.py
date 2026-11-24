"""Recent Garmin import."""
import os
import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from garmin_personal_api import GarminPersonalApiClient, PersonalApiAuthenticator
from garmin_coverage import ImportJob, SOURCES, SearchConflict, activity_import, daily_import, dates, error_code, json_value, retry, writer

TIMEZONE = ZoneInfo(os.environ.get("GARMIN_TIMEZONE", "Europe/Rome"))
MAX_DAYS = 31


def fail_if_missing_env(name):
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Variabile mancante: {name}")
    return value


def authenticate_garmin(api_key):
    with PersonalApiAuthenticator() as auth:
        token = auth.obtain_token(api_key)
    if not token or not token.access_token:
        raise RuntimeError("Token Garmin non disponibile")
    return token.access_token


def fetch_activities(garmin, start_date, end_date):
    def search(offset):
        page = retry(lambda: garmin.search_activities(
            start=offset, limit=50, start_date=start_date.isoformat(), end_date=end_date.isoformat()))
        if not isinstance(page, list) or len(page) > 50:
            raise TypeError("Formato inatteso in search_activities")
        return page

    activities = []
    seen = set()
    first = None
    for offset in range(0, 5000, 50):
        page = search(offset)
        if first is None:
            first = page
        for activity in page:
            identifier = activity_identifier(activity)
            if identifier in seen:
                raise SearchConflict("ID duplicato nella ricerca attività")
            seen.add(identifier)
        activities.extend(page)
        if len(page) < 50:
            if offset and search(0) != first:
                raise SearchConflict("Prima pagina cambiata durante la ricerca")
            return activities
    raise ValueError("Limite paginazione raggiunto")


def activity_identifier(activity):
    if not isinstance(activity, dict):
        raise TypeError("Formato attività non valido")
    supplied = activity.get("activityId")
    if type(supplied) not in (int, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", str(supplied)):
        raise ValueError("ID attività non valido")
    identifier = int(supplied)
    if identifier > 9223372036854775807:
        raise ValueError("ID attività non valido")
    return identifier


def fetch_activity_details(garmin, activities):
    rows = {}
    for activity in activities:
        activity_id = activity_identifier(activity)
        local_start = activity.get("startTimeLocal")
        if not isinstance(local_start, str) or len(local_start) < 19:
            raise ValueError("Data attività mancante")
        activity_date = datetime.fromisoformat(local_start).date()
        activity_type = activity.get("activityType")
        if isinstance(activity_type, dict):
            activity_type = activity_type.get("typeKey")
        if not isinstance(activity_type, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", activity_type):
            raise ValueError("Tipo attività non valido")
        previous = rows.get(activity_id)
        if previous:
            if previous[1] != activity_date or previous[2] != activity_type:
                raise ValueError("Attività duplicata con metadati discordanti")
            continue
        detail = retry(lambda: garmin.get_activity(activity_id))
        if not isinstance(detail, dict) or not detail or str(detail.get("activityId", activity_id)) != str(activity_id):
            raise ValueError("Dettaglio attività indisponibile")
        rows[activity_id] = (activity_id, activity_date, activity_type,
                             json_value({"summary": activity, "detail": detail}))
    return list(rows.values())


def import_activities(conn, version, garmin, start, end, today):
    return activity_import(conn, version, garmin, start, end, today, fetch_activities, fetch_activity_details)


def main(job):
    days = int(os.environ.get("SYNC_DAYS", "3"))
    if not 1 <= days <= MAX_DAYS:
        raise ValueError("SYNC_DAYS deve essere tra 1 e 31")
    today = datetime.now(TIMEZONE).date()
    start = today - timedelta(days=days - 1)
    with writer(fail_if_missing_env("SUPABASE_DATABASE_URL")) as (conn, version):
        token = authenticate_garmin(fail_if_missing_env("GARMIN_PERSONAL_API_KEY"))
        with GarminPersonalApiClient(token) as garmin:
            job.run("activities", start, today, lambda: import_activities(conn, version, garmin, start, today, today))
            for day in dates(start, today):
                for source in SOURCES:
                    job.run(source, day, day, lambda: daily_import(conn, version, garmin, day, source, today))


def run_job(operation):
    job = ImportJob()
    try:
        operation(job)
    except Exception as exc:
        job.interrupted = True
        print(f"Import interrotto ({error_code(exc)}).", file=sys.stderr)
    return job.finish()


if __name__ == "__main__":
    sys.exit(run_job(main))
