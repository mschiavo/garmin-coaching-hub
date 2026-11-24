"""Plan bounded repairs. Garmin is contacted only with --execute."""
import argparse
from datetime import date, datetime
import json
import sys

import psycopg
from garmin_personal_api import GarminPersonalApiClient

from garmin_coverage import ImportJob, daily_import, error_code, repair_plan, schema_version, writer
from sync_garmin import TIMEZONE, authenticate_garmin, fail_if_missing_env, import_activities, run_job


def plan(conn, start, end):
    if schema_version(conn) != 34:
        raise RuntimeError("Riparazione richiede schema V3.4")
    return repair_plan(conn, start, end)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("start", type=date.fromisoformat)
    parser.add_argument("end", type=date.fromisoformat)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true")
    mode.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    today = datetime.now(TIMEZONE).date()
    if not 0 <= (args.end - args.start).days < 31 or args.end > today:
        parser.error("Intervallo passato o corrente di massimo 31 giorni")
    database_url = fail_if_missing_env("SUPABASE_DATABASE_URL")
    if not args.execute:
        with psycopg.connect(database_url, sslmode="require", connect_timeout=15) as conn:
            conn.read_only = True
            with conn.transaction():
                tasks = plan(conn, args.start, args.end)
        print(json.dumps([{"date": day.isoformat(), "source": source} for day, source in tasks]))
        return
    return run_job(lambda job: execute(job, database_url, args.start, args.end, today))


def execute(job: ImportJob, database_url, start, end, today):
    with writer(database_url) as (conn, version):
        tasks = plan(conn, start, end)
        if not tasks:
            return
        token = authenticate_garmin(fail_if_missing_env("GARMIN_PERSONAL_API_KEY"))
        with GarminPersonalApiClient(token) as garmin:
            for day, source in tasks:
                if source == "activities":
                    job.run(source, day, day, lambda: import_activities(conn, version, garmin, day, day, today))
                else:
                    job.run(source, day, day, lambda: daily_import(conn, version, garmin, day, source, today))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Riparazione interrotta ({error_code(exc)}).", file=sys.stderr)
        sys.exit(1)
