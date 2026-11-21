
"""
Garmin -> Supabase: importazione storica mensile.

Compatibile con:
- sync_garmin.py
- Garmin History Import (GitHub Actions)
- garmin-connect-personal-api-python 1.1.0
- psycopg 3.x

Variabili d'ambiente:
- IMPORT_MONTH
- GARMIN_PERSONAL_API_KEY
- SUPABASE_DATABASE_URL
"""

import os
import sys
import time
import random
import calendar

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from garmin_personal_api import GarminPersonalApiClient

from sync_garmin import (
    authenticate_garmin,
    fetch_activities,
    fetch_activity_details,
    fetch_daily_metrics,
    save_to_supabase,
    fail_if_missing_env,
    log,
)


TIMEZONE = ZoneInfo("Europe/Rome")

CHUNK_DAYS = 7
PAUSE_SECONDS = 3

MAX_RETRIES = 4
RETRY_HTTP_CODES = {429, 500, 502, 503, 504}


# ============================================
# DATE
# ============================================

def get_month_range(month_string):
    try:
        year, month = map(
            int,
            month_string.split("-"),
        )

        if year != 2026 or not 1 <= month <= 12:
            raise ValueError()

        start_date = date(year, month, 1)

        last_day = calendar.monthrange(
            year, month
        )[1]

        end_date = date(
            year,
            month,
            last_day,
        )

    except (ValueError, TypeError):
        raise ValueError(
            "IMPORT_MONTH non valido. "
            "Usare YYYY-MM, anno 2026."
        ) from None

    today = datetime.now(TIMEZONE).date()

    if start_date > today:
        raise ValueError(
            "Il mese richiesto è nel futuro."
        )

    return start_date, min(end_date, today)


# ============================================
# GESTIONE ERRORI HTTP
# ============================================

def get_http_status(exc):
    """
    Recupera il codice HTTP quando disponibile,
    senza stampare informazioni riservate.
    """
    for attr in (
        "status_code",
        "status",
    ):
        value = getattr(exc, attr, None)

        if isinstance(value, int):
            return value

    response = getattr(
        exc,
        "response",
        None,
    )

    if response is not None:
        value = getattr(
            response,
            "status_code",
            None,
        )

        if isinstance(value, int):
            return value

    return None


def retry_operation(
    operation,
    description,
):
    for attempt in range(
        1,
        MAX_RETRIES + 1,
    ):
        try:
            return operation()

        except Exception as exc:
            status = get_http_status(exc)
            error_name = type(exc).__name__

            retryable = (
                status in RETRY_HTTP_CODES
                or (
                    status is None
                    and error_name in (
                        "Timeout",
                        "ConnectionError",
                        "ReadTimeout",
                        "ConnectTimeout",
                    )
                )
            )

            if status is None:
                log(
                    f"ERRORE {description}: "
                    f"{error_name}"
                )
            else:
                log(
                    f"ERRORE {description}: "
                    f"HTTP {status}"
                )

            if not retryable:
                raise

            if attempt >= MAX_RETRIES:
                log(
                    "Numero massimo di "
                    "tentativi raggiunto."
                )
                raise

            wait_seconds = min(
                180,
                15 * (2 ** (attempt - 1))
                + random.uniform(0, 5),
            )

            log(
                f"Tentativo {attempt}/"
                f"{MAX_RETRIES}. "
                f"Attesa {wait_seconds:.0f}s"
            )

            time.sleep(wait_seconds)


# ============================================
# CONTROLLO GIORNATE GIA' IMPORTATE
# ============================================

def get_completed_days(
    database_url,
    start_date,
    end_date,
):
    completed = set()

    with psycopg.connect(
        database_url,
        sslmode="require",
        connect_timeout=15,
    ) as connection:

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT metric_date
                FROM coaching.garmin_daily_metrics
                WHERE metric_date BETWEEN %s AND %s
                  AND sleep_data IS NOT NULL
                  AND hrv_data IS NOT NULL
                  AND body_battery_data IS NOT NULL
                  AND stress_data IS NOT NULL
                  AND daily_summary IS NOT NULL
                """,
                (start_date, end_date),
            )

            completed = {
                row[0]
                for row in cursor.fetchall()
            }

    return completed


# ============================================
# IMPORTAZIONE
# ============================================

def main():
    log("================================")
    log("GARMIN HISTORY IMPORT")
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

    log("Verifica giornate già presenti...")

    completed_days = get_completed_days(
        database_url,
        start_date,
        end_date,
    )

    log(
        f"Giornate già presenti: "
        f"{len(completed_days)}"
    )

    access_token = authenticate_garmin(
        api_key
    )

    total_activities = 0
    total_days = 0
    skipped_days = 0

    current = start_date

    with GarminPersonalApiClient(
        access_token
    ) as garmin:

        while current <= end_date:

            chunk_end = min(
                current + timedelta(
                    days=CHUNK_DAYS - 1
                ),
                end_date,
            )

            log("--------------------------------")
            log(
                f"BLOCCO: {current} / {chunk_end}"
            )

            # Le attività vengono sempre aggiornate.
            activities = retry_operation(
                lambda: fetch_activities(
                    garmin,
                    current,
                    chunk_end,
                ),
                "ricerca attività",
            )

            activity_rows = retry_operation(
                lambda: fetch_activity_details(
                    garmin,
                    activities,
                ),
                "dettagli attività",
            )

            # Recuperiamo soltanto le giornate
            # che non risultano già presenti.
            daily_rows = []

            day = current

            while day <= chunk_end:

                if day in completed_days:
                    log(
                        f"Giornata già presente: "
                        f"{day}"
                    )
                    skipped_days += 1

                else:
                    rows = retry_operation(
                        lambda d=day:
                            fetch_daily_metrics(
                                garmin,
                                d,
                                d,
                            ),
                        f"metriche {day}",
                    )

                    daily_rows.extend(rows)

                day += timedelta(days=1)

            save_to_supabase(
                database_url,
                activity_rows,
                daily_rows,
            )

            total_activities += len(
                activity_rows
            )

            total_days += len(
                daily_rows
            )

            log(
                f"BLOCCO COMPLETATO: "
                f"{current} / {chunk_end}"
            )

            current = chunk_end + timedelta(
                days=1
            )

            if current <= end_date:
                time.sleep(PAUSE_SECONDS)

    log("================================")
    log("IMPORTAZIONE COMPLETATA")
    log(f"Mese: {month_string}")
    log(
        f"Attività elaborate: "
        f"{total_activities}"
    )
    log(
        f"Giornate importate: "
        f"{total_days}"
    )
    log(
        f"Giornate già presenti: "
        f"{skipped_days}"
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
