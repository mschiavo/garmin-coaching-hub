"""Monthly Garmin import in bounded calendar chunks."""
import calendar
import os
import sys
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from garmin_personal_api import GarminPersonalApiClient
from garmin_coverage import daily_import, error_code, legacy_plan, repair_plan, writer
from sync_garmin import authenticate_garmin, fail_if_missing_env, import_activities

TIMEZONE = ZoneInfo(os.environ.get("GARMIN_TIMEZONE", "Europe/Rome"))
CHUNK_DAYS = 7


def get_month_range(month_string):
    try:
        if (
            len(month_string) != 7
            or month_string[4] != "-"
        ):
            raise ValueError()

        year = int(month_string[:4])
        month = int(month_string[5:])

        if not 1 <= year <= 9999:
            raise ValueError()

        if not 1 <= month <= 12:
            raise ValueError()

        start_date = date(year, month, 1)

        last_day = calendar.monthrange(
            year, month
        )[1]

        end_date = date(
            year,
            month,
            last_day
        )

    except (ValueError, TypeError):
        raise ValueError(
            "IMPORT_MONTH non valido. "
            "Formato richiesto: YYYY-MM"
        ) from None

    today = datetime.now(TIMEZONE).date()

    if start_date > today:
        raise ValueError(
            "Non puoi importare mesi futuri."
        )

    return start_date, min(end_date, today)


def main():
    start, end = get_month_range(fail_if_missing_env("IMPORT_MONTH"))
    today = datetime.now(TIMEZONE).date()
    with writer(fail_if_missing_env("SUPABASE_DATABASE_URL")) as (conn, version):
        token = authenticate_garmin(fail_if_missing_env("GARMIN_PERSONAL_API_KEY"))
        with GarminPersonalApiClient(token) as garmin:
            incomplete = 0
            current = start
            while current <= end:
                chunk_end = min(current + timedelta(days=CHUNK_DAYS - 1), end)
                plan = repair_plan(conn, current, chunk_end) if version == 34 else legacy_plan(conn, current, chunk_end)
                # Legacy has no trustworthy activity coverage. Revisit the entire chunk.
                activity_days = [day for day, source in plan if source == "activities"]
                if version == 33 or len(activity_days) == (chunk_end - current).days + 1:
                    import_activities(conn, version, garmin, current, chunk_end, today)
                else:
                    for day in activity_days:
                        import_activities(conn, version, garmin, day, day, today)
                for day, source in plan:
                    if source != "activities":
                        incomplete += not daily_import(conn, version, garmin, day, source, today)
                current = chunk_end + timedelta(days=1)
                if current <= end:
                    time.sleep(3)
    print(f"Periodo elaborato: {start} / {end}. Fonti giornaliere incomplete: {incomplete}. Schema: {version}.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Importazione interrotta ({error_code(exc)}). I commit precedenti restano disponibili.", file=sys.stderr)
        sys.exit(1)
