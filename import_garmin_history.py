
"""
GARMIN -> SUPABASE
Importazione storica mensile - versione 3

Compatibile con:
- garmin-connect-personal-api-python==1.1.0
- psycopg 3.x
- sync_garmin.py esistente

Variabili:
- IMPORT_MONTH
- GARMIN_PERSONAL_API_KEY
- SUPABASE_DATABASE_URL
"""

import os
import sys
import time
import random
import calendar
import json

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from psycopg.types.json import Jsonb

from garmin_personal_api import GarminPersonalApiClient

from sync_garmin import (
    authenticate_garmin,
    fetch_activities,
    fetch_activity_details,
    fail_if_missing_env,
    log,
)


TIMEZONE = ZoneInfo("Europe/Rome")

CHUNK_DAYS = 7
PAUSE_SECONDS = 3
MAX_ATTEMPTS = 4

RETRY_HTTP_CODES = {
    408, 429, 500, 502, 503, 504
}


# ============================================
# GESTIONE DATE
# ============================================

def get_month_range(month_string):
    try:
        if (
            len(month_string) != 7
            or month_string[4] != "-"
        ):
            raise ValueError()

        year = int(month_string[:4])
        month = int(month_string[5:])

        if year != 2026:
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
            "Formato richiesto: 2026-MM"
        ) from None

    today = datetime.now(TIMEZONE).date()

    if start_date > today:
        raise ValueError(
            "Non puoi importare mesi futuri."
        )

    return start_date, min(end_date, today)


# ============================================
# GESTIONE ERRORI
# ============================================

def get_http_status(exc):
    """
    Cerca il codice HTTP senza stampare
    URL, token o contenuti delle risposte.
    """
    for attr in ("status_code", "status"):
        value = getattr(exc, attr, None)

        if isinstance(value, int):
            return value

    response = getattr(exc, "response", None)

    if response is not None:
        value = getattr(
            response,
            "status_code",
            None
        )

        if isinstance(value, int):
            return value

    return None


def retry_operation(operation, description):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return operation()

        except Exception as exc:
            status = get_http_status(exc)
            error_type = type(exc).__name__

            retryable = (
                status in RETRY_HTTP_CODES
                or (
                    status is None
                    and error_type in {
                        "Timeout",
                        "ReadTimeout",
                        "ConnectTimeout",
                        "ConnectionError",
                    }
                )
            )

            if status is not None:
                log(
                    f"ERRORE {description}: "
                    f"HTTP {status}"
                )
            else:
                log(
                    f"ERRORE {description}: "
                    f"{error_type}"
                )

            if not retryable:
                raise

            if attempt == MAX_ATTEMPTS:
                raise

            delay = min(
                120,
                10 * (2 ** (attempt - 1))
                + random.uniform(0, 3)
            )

            log(
                f"Nuovo tentativo tra "
                f"{delay:.0f} secondi"
            )

            time.sleep(delay)


# ============================================
# METRICHE GARMIN
# ============================================

def fetch_single_metric(
    operation,
    metric_name,
    day,
):
    """
    Una metrica non disponibile non blocca
    l'importazione dell'intera giornata.
    """
    try:
        result = retry_operation(
            operation,
            f"{metric_name} {day}"
        )

        json.dumps(result)

        return result, True

    except Exception as exc:
        status = get_http_status(exc)

        if status is not None:
            log(
                f"METRICA NON DISPONIBILE: "
                f"{metric_name} {day} "
                f"(HTTP {status})"
            )
        else:
            log(
                f"METRICA NON DISPONIBILE: "
                f"{metric_name} {day} "
                f"({type(exc).__name__})"
            )

        return None, False


def fetch_day_metrics(garmin, current_date):
    day = current_date.isoformat()

    log(f"Giornata: {day}")

    metrics = {}

    operations = {
        "sleep": lambda:
            garmin.get_daily_sleep(day),

        "hrv": lambda:
            garmin.get_daily_hrv(day),

        "body_battery": lambda:
            garmin.get_daily_body_battery(
                day, day
            ),

        "stress": lambda:
            garmin.get_daily_stress(
                day, day
            ),

        "daily_summary": lambda:
            garmin.get_daily_summaries(
                day, day
            ),
    }

    failed = []

    for name, operation in operations.items():
        log(f"  Lettura {name}")

        value, success = fetch_single_metric(
            operation,
            name,
            day
        )

        metrics[name] = value

        if not success:
            failed.append(name)

    row = (
        current_date,
        Jsonb(metrics["sleep"]),
        Jsonb(metrics["hrv"]),
        Jsonb(metrics["body_battery"]),
        Jsonb(metrics["stress"]),
        Jsonb(metrics["daily_summary"]),
    )

    return row, failed


# ============================================
# DATABASE
# ============================================

def get_completed_days(
    database_url,
    start_date,
    end_date,
):
    """
    Considera completa una giornata soltanto
    se tutte le metriche sono presenti
    e diverse da JSON null.
    """
    with psycopg.connect(
        database_url,
        sslmode="require",
        connect_timeout=15
    ) as connection:

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT metric_date
                FROM coaching.garmin_daily_metrics
                WHERE metric_date BETWEEN %s AND %s

                  AND sleep_data IS NOT NULL
                  AND sleep_data <> 'null'::jsonb

                  AND hrv_data IS NOT NULL
                  AND hrv_data <> 'null'::jsonb

                  AND body_battery_data IS NOT NULL
                  AND body_battery_data <> 'null'::jsonb

                  AND stress_data IS NOT NULL
                  AND stress_data <> 'null'::jsonb

                  AND daily_summary IS NOT NULL
                  AND daily_summary <> 'null'::jsonb
                """,
                (start_date, end_date)
            )

            return {
                row[0]
                for row in cursor.fetchall()
            }


def save_block(
    database_url,
    activity_rows,
    daily_rows,
):
    log("Connessione Supabase")

    with psycopg.connect(
        database_url,
        sslmode="require",
        connect_timeout=15
    ) as connection:

        with connection.cursor() as cursor:

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
                    row
                )

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
                            COALESCE(
                                NULLIF(
                                    EXCLUDED.sleep_data,
                                    'null'::jsonb
                                ),
                                coaching.garmin_daily_metrics.sleep_data
                            ),
                        hrv_data =
                            COALESCE(
                                NULLIF(
                                    EXCLUDED.hrv_data,
                                    'null'::jsonb
                                ),
                                coaching.garmin_daily_metrics.hrv_data
                            ),
                        body_battery_data =
                            COALESCE(
                                NULLIF(
                                    EXCLUDED.body_battery_data,
                                    'null'::jsonb
                                ),
                                coaching.garmin_daily_metrics.body_battery_data
                            ),
                        stress_data =
                            COALESCE(
                                NULLIF(
                                    EXCLUDED.stress_data,
                                    'null'::jsonb
                                ),
                                coaching.garmin_daily_metrics.stress_data
                            ),
                        daily_summary =
                            COALESCE(
                                NULLIF(
                                    EXCLUDED.daily_summary,
                                    'null'::jsonb
                                ),
                                coaching.garmin_daily_metrics.daily_summary
                            ),
                        synced_at = NOW()
                    """,
                    row
                )

        connection.commit()

    log("Blocco salvato correttamente")


# ============================================
# IMPORTAZIONE PRINCIPALE
# ============================================

def main():
    log("================================")
    log("GARMIN HISTORY IMPORT - VERSIONE 3")
    log("================================")

    month_string = fail_if_missing_env(
        "IMPORT_MONTH"
    )

    api_key = fail_if_missing_env(
        "GARMIN_PERSONAL_API_KEY"
    )

    database_url = fail_if_missing_env(
        "SUPABASE_DATABASE_URL"
    )

    start_date, end_date = get_month_range(
        month_string
    )

    log(f"Mese: {month_string}")
    log(f"Periodo: {start_date} / {end_date}")

    completed_days = get_completed_days(
        database_url,
        start_date,
        end_date
    )

    log(
        f"Giornate già complete: "
        f"{len(completed_days)}"
    )

    token = authenticate_garmin(api_key)

    total_activities = 0
    total_days = 0
    total_skipped = 0
    total_incomplete = 0

    current = start_date

    with GarminPersonalApiClient(token) as garmin:

        while current <= end_date:

            chunk_end = min(
                current + timedelta(
                    days=CHUNK_DAYS - 1
                ),
                end_date
            )

            log("--------------------------------")
            log(
                f"BLOCCO: {current} / {chunk_end}"
            )

            activities = retry_operation(
                lambda: fetch_activities(
                    garmin,
                    current,
                    chunk_end
                ),
                "ricerca attività"
            )

            activity_rows = retry_operation(
                lambda: fetch_activity_details(
                    garmin,
                    activities
                ),
                "dettagli attività"
            )

            daily_rows = []

            day = current

            while day <= chunk_end:

                if day in completed_days:
                    log(
                        f"Giornata già completa: "
                        f"{day}"
                    )
                    total_skipped += 1

                else:
                    row, failed = fetch_day_metrics(
                        garmin,
                        day
                    )

                    daily_rows.append(row)

                    if failed:
                        total_incomplete += 1
                        log(
                            f"Metriche mancanti {day}: "
                            + ", ".join(failed)
                        )

                day += timedelta(days=1)

            save_block(
                database_url,
                activity_rows,
                daily_rows
            )

            total_activities += len(activity_rows)
            total_days += len(daily_rows)

            current = chunk_end + timedelta(
                days=1
            )

            if current <= end_date:
                time.sleep(PAUSE_SECONDS)

    log("================================")
    log("IMPORTAZIONE COMPLETATA")
    log(f"Mese: {month_string}")
    log(f"Attività elaborate: {total_activities}")
    log(f"Giornate importate: {total_days}")
    log(f"Giornate già complete: {total_skipped}")
    log(
        f"Giornate con errori: "
        f"{total_incomplete}"
    )
    log("================================")


if __name__ == "__main__":
    try:
        main()

    except Exception as exc:
        log("================================")
        log("IMPORTAZIONE FALLITA")
        log(
            f"Tipo errore: "
            f"{type(exc).__name__}"
        )

        status = get_http_status(exc)

        if status is not None:
            log(f"Codice HTTP: {status}")

        log(
            "I blocchi già salvati "
            "rimangono nel database."
        )
        log("================================")

        sys.exit(1)
