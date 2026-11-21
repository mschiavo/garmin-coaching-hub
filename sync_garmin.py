
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


# ============================================
# CONFIGURAZIONE
# ============================================

TIMEZONE = ZoneInfo("Europe/Rome")
MAX_DAYS = 31


def log(message):
    print(message, flush=True)


def fail_if_missing_env(name):
    value = os.environ.get(name)

    if not value:
        raise ValueError(
            f"Variabile d'ambiente mancante: {name}"
        )

    return value


def get_sync_days():
    days = int(os.environ.get("SYNC_DAYS", "3"))

    if not 1 <= days <= MAX_DAYS:
        raise ValueError(
            "SYNC_DAYS deve essere tra 1 e 31"
        )

    return days


def ensure_json_compatible(value):
    """
    Verifica che il valore possa essere
    serializzato in JSON.
    """
    import json

    json.dumps(value)
    return value


# ============================================
# GARMIN - AUTENTICAZIONE
# ============================================

def authenticate_garmin(api_key):
    log("FASE 1: Autenticazione Garmin")

    with PersonalApiAuthenticator() as auth:
        token = auth.obtain_token(api_key)

    if not token or not token.access_token:
        raise RuntimeError(
            "Token Garmin non disponibile"
        )

    log("FASE 1: OK")

    return token.access_token


# ============================================
# GARMIN - ATTIVITA'
# ============================================

def fetch_activities(garmin, start_date, end_date):
    log("FASE 2: Ricerca attività")

    activities = []
    offset = 0
    page_size = 50

    while True:
        page = garmin.search_activities(
            start=offset,
            limit=page_size,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat(),
        )

        if not isinstance(page, list):
            raise TypeError(
                "Formato inatteso in search_activities"
            )

        activities.extend(page)

        if len(page) < page_size:
            break

        offset += page_size

        if offset >= 5000:
            raise RuntimeError(
                "Limite paginazione raggiunto"
            )

    log(
        f"FASE 2: OK - "
        f"{len(activities)} attività trovate"
    )

    return activities


def fetch_activity_details(garmin, activities):
    log("FASE 3: Recupero dettagli attività")

    rows = []

    for index, activity in enumerate(activities, 1):

        if not isinstance(activity, dict):
            raise TypeError(
                "Formato attività non valido"
            )

        activity_id = int(activity["activityId"])

        detail = garmin.get_activity(activity_id)

        if not isinstance(detail, dict):
            raise TypeError(
                "Formato dettaglio attività non valido"
            )

        date_string = activity.get(
            "startTimeLocal"
        )

        activity_date = None

        if date_string:
            activity_date = datetime.fromisoformat(
                date_string
            ).date()

        activity_type = activity.get(
            "activityType"
        )

        if isinstance(activity_type, dict):
            activity_type = activity_type.get(
                "typeKey"
            )

        raw_data = {
            "summary": activity,
            "detail": detail,
        }

        ensure_json_compatible(raw_data)

        rows.append((
            activity_id,
            activity_date,
            activity_type,
            Jsonb(raw_data),
        ))

        log(
            f"  Attività elaborata: "
            f"{index}/{len(activities)}"
        )

    log(
        f"FASE 3: OK - "
        f"{len(rows)} attività elaborate"
    )

    return rows


# ============================================
# GARMIN - METRICHE GIORNALIERE
# ============================================

def fetch_daily_metrics(
    garmin,
    start_date,
    end_date,
):
    log("FASE 4: Recupero metriche giornaliere")

    rows = []
    current_date = start_date

    while current_date <= end_date:

        day = current_date.isoformat()

        log(f"  Elaborazione giornata: {day}")

        log("    Lettura sonno")
        sleep = garmin.get_daily_sleep(day)

        log("    Lettura HRV")
        hrv = garmin.get_daily_hrv(day)

        log("    Lettura Body Battery")
        body_battery = garmin.get_daily_body_battery(
            day,
            day,
        )

        log("    Lettura stress")
        stress = garmin.get_daily_stress(
            day,
            day,
        )

        log("    Lettura riepilogo giornaliero")
        daily_summary = garmin.get_daily_summaries(
            day,
            day,
        )

        metrics = [
            sleep,
            hrv,
            body_battery,
            stress,
            daily_summary,
        ]

        for metric in metrics:
            ensure_json_compatible(metric)

        rows.append((
            current_date,
            Jsonb(sleep),
            Jsonb(hrv),
            Jsonb(body_battery),
            Jsonb(stress),
            Jsonb(daily_summary),
        ))

        current_date += timedelta(days=1)

    log(
        f"FASE 4: OK - "
        f"{len(rows)} giornate elaborate"
    )

    return rows


# ============================================
# SUPABASE - SALVATAGGIO
# ============================================

def save_to_supabase(
    database_url,
    activity_rows,
    daily_rows,
):
    log("FASE 5: Connessione Supabase")

    with psycopg.connect(
        database_url,
        sslmode="require",
        connect_timeout=15,
    ) as connection:

        log("FASE 5: Connessione riuscita")

        with connection.cursor() as cursor:

            log("FASE 6: Salvataggio attività")

            for row in activity_rows:
                cursor.execute(
                    """
                    INSERT INTO coaching.garmin_activities
                    (
                        activity_id,
                        activity_date,
                        activity_type,
                        raw_data
                    )
                    VALUES (%s, %s, %s, %s)

                    ON CONFLICT (activity_id)
                    DO UPDATE SET
                        activity_date =
                            EXCLUDED.activity_date,
                        activity_type =
                            EXCLUDED.activity_type,
                        raw_data =
                            EXCLUDED.raw_data,
                        synced_at = NOW()
                    """,
                    row,
                )

            log(
                f"FASE 6: OK - "
                f"{len(activity_rows)} attività"
            )

            log("FASE 7: Salvataggio metriche")

            for row in daily_rows:
                cursor.execute(
                    """
                    INSERT INTO
                        coaching.garmin_daily_metrics
                    (
                        metric_date,
                        sleep_data,
                        hrv_data,
                        body_battery_data,
                        stress_data,
                        daily_summary
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s
                    )

                    ON CONFLICT (metric_date)
                    DO UPDATE SET
                        sleep_data =
                            EXCLUDED.sleep_data,
                        hrv_data =
                            EXCLUDED.hrv_data,
                        body_battery_data =
                            EXCLUDED.body_battery_data,
                        stress_data =
                            EXCLUDED.stress_data,
                        daily_summary =
                            EXCLUDED.daily_summary,
                        synced_at = NOW()
                    """,
                    row,
                )

            log(
                f"FASE 7: OK - "
                f"{len(daily_rows)} giornate"
            )

        connection.commit()

    log("FASE 8: Commit database completato")


# ============================================
# PROGRAMMA PRINCIPALE
# ============================================

def main():
    log("================================")
    log("GARMIN -> SUPABASE SYNC")
    log("================================")

    days = get_sync_days()

    api_key = fail_if_missing_env(
        "GARMIN_PERSONAL_API_KEY"
    )

    database_url = fail_if_missing_env(
        "SUPABASE_DATABASE_URL"
    )

    today = datetime.now(TIMEZONE).date()

    start_date = today - timedelta(
        days=days - 1
    )

    log(f"Periodo: {start_date} / {today}")
    log(f"Giorni richiesti: {days}")

    access_token = authenticate_garmin(
        api_key
    )

    with GarminPersonalApiClient(
        access_token
    ) as garmin:

        activities = fetch_activities(
            garmin,
            start_date,
            today,
        )

        activity_rows = fetch_activity_details(
            garmin,
            activities,
        )

        daily_rows = fetch_daily_metrics(
            garmin,
            start_date,
            today,
        )

    save_to_supabase(
        database_url,
        activity_rows,
        daily_rows,
    )

    log("================================")
    log("SINCRONIZZAZIONE COMPLETATA")
    log(
        f"Attività elaborate: "
        f"{len(activity_rows)}"
    )
    log(
        f"Giornate elaborate: "
        f"{len(daily_rows)}"
    )
    log("================================")


if __name__ == "__main__":
    try:
        main()

    except Exception as exc:
        log("================================")
        log("SINCRONIZZAZIONE FALLITA")
        log(
            f"Tipo errore: "
            f"{type(exc).__name__}"
        )
        log("================================")

        # Non stampiamo il messaggio completo
        # dell'eccezione per evitare di esporre
        # credenziali o dati sensibili.

        sys.exit(1)
