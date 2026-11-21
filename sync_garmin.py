
import os
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from psycopg.types.json import Jsonb
from garmin_personal_api import (
    GarminPersonalApiClient,
    PersonalApiAuthenticator,
)

TZ = ZoneInfo("Europe/Rome")
DAYS = int(os.getenv("SYNC_DAYS", "3"))
MAX_DAYS = 31


def main():
    if not 1 <= DAYS <= MAX_DAYS:
        raise ValueError("SYNC_DAYS deve essere tra 1 e 31")

    api_key = os.environ["GARMIN_PERSONAL_API_KEY"]
    database_url = os.environ["SUPABASE_DATABASE_URL"]

    today = datetime.now(TZ).date()
    start_date = today - timedelta(days=DAYS - 1)

    print(f"Periodo: {start_date} / {today}")

    # Autenticazione Garmin
    with PersonalApiAuthenticator() as auth:
        token = auth.obtain_token(api_key)

    with GarminPersonalApiClient(token.access_token) as garmin:
        activities = []
        offset = 0
        page_size = 50

        # Recupero attività con paginazione
        while True:
            page = garmin.search_activities(
                start=offset,
                limit=page_size,
                start_date=start_date.isoformat(),
                end_date=today.isoformat(),
            )

            if not isinstance(page, list):
                raise RuntimeError(
                    "Formato inatteso della lista attività"
                )

            activities.extend(page)

            if len(page) < page_size:
                break

            offset += page_size

            if offset >= 5000:
                raise RuntimeError(
                    "Limite di sicurezza paginazione raggiunto"
                )

        # Recupero dettagli attività
        activity_rows = []

        for item in activities:
            activity_id = int(item["activityId"])
            detail = garmin.get_activity(activity_id)

            if not isinstance(detail, dict):
                raise RuntimeError(
                    "Dettaglio attività non valido"
                )

            activity_date = None
            date_string = item.get("startTimeLocal")

            if date_string:
                activity_date = datetime.fromisoformat(
                    date_string
                ).date()

            activity_type = item.get("activityType")

            if isinstance(activity_type, dict):
                activity_type = activity_type.get("typeKey")

            activity_rows.append((
                activity_id,
                activity_date,
                activity_type,
                Jsonb({
                    "summary": item,
                    "detail": detail,
                }),
            ))

        # Recupero metriche giornaliere
        daily_rows = []
        current = start_date

        while current <= today:
            day = current.isoformat()

            sleep = garmin.get_daily_sleep(day)
            hrv = garmin.get_daily_hrv(day)
            battery = garmin.get_daily_body_battery(
                day, day
            )
            stress = garmin.get_daily_stress(
                day, day
            )
            summary = garmin.get_daily_summaries(
                day, day
            )

            daily_rows.append((
                current,
                Jsonb(sleep),
                Jsonb(hrv),
                Jsonb(battery),
                Jsonb(stress),
                Jsonb(summary),
            ))

            current += timedelta(days=1)

    # Connessione Supabase PostgreSQL
    with psycopg.connect(
        database_url,
        sslmode="require",
        connect_timeout=15,
    ) as conn:

        with conn.cursor() as cur:

            # Salvataggio attività
            for row in activity_rows:
                cur.execute(
                    """
                    insert into coaching.garmin_activities
                    (
                        activity_id,
                        activity_date,
                        activity_type,
                        raw_data
                    )
                    values (%s, %s, %s, %s)

                    on conflict (activity_id)
                    do update set
                        activity_date =
                            excluded.activity_date,
                        activity_type =
                            excluded.activity_type,
                        raw_data =
                            excluded.raw_data,
                        synced_at = now()
                    """,
                    row,
                )

            # Salvataggio metriche giornaliere
            for row in daily_rows:
                cur.execute(
                    """
                    insert into coaching.garmin_daily_metrics
                    (
                        metric_date,
                        sleep_data,
                        hrv_data,
                        body_battery_data,
                        stress_data,
                        daily_summary
                    )
                    values (%s, %s, %s, %s, %s, %s)

                    on conflict (metric_date)
                    do update set
                        sleep_data =
                            excluded.sleep_data,
                        hrv_data =
                            excluded.hrv_data,
                        body_battery_data =
                            excluded.body_battery_data,
                        stress_data =
                            excluded.stress_data,
                        daily_summary =
                            excluded.daily_summary,
                        synced_at = now()
                    """,
                    row,
                )

        conn.commit()

    print("SINCRONIZZAZIONE COMPLETATA")
    print(f"Attività elaborate: {len(activity_rows)}")
    print(f"Giornate elaborate: {len(daily_rows)}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(
            "SINCRONIZZAZIONE FALLITA. "
            "Controllare connessione, permessi "
            "e struttura dei dati.",
            file=sys.stderr,
        )
        sys.exit(1)
