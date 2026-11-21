
"""
Importazione storica Garmin -> Supabase.

Importa un mese alla volta, in blocchi di 7 giorni.
Riutilizza le funzioni di sync_garmin.py, già testate.

Variabile richiesta:
    IMPORT_MONTH = YYYY-MM
"""

import os
import sys
import calendar
import time

from datetime import date, timedelta
from zoneinfo import ZoneInfo
from datetime import datetime

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
PAUSE_SECONDS = 2


def get_month_range(month_string):
    try:
        year, month = map(
            int, month_string.split("-")
        )

        if not 1 <= month <= 12:
            raise ValueError()

        if year != 2026:
            raise ValueError()

        start = date(year, month, 1)

        last_day = calendar.monthrange(
            year, month
        )[1]

        end = date(year, month, last_day)

    except (ValueError, TypeError):
        raise ValueError(
            "IMPORT_MONTH deve essere nel "
            "formato YYYY-MM e appartenere al 2026"
        ) from None

    today = datetime.now(TIMEZONE).date()

    if start > today:
        raise ValueError(
            "Non è possibile importare mesi futuri"
        )

    return start, min(end, today)


def main():
    log("================================")
    log("GARMIN -> SUPABASE HISTORY IMPORT")
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

    log(f"Mese richiesto: {month_string}")
    log(f"Periodo: {start_date} / {end_date}")

    access_token = authenticate_garmin(
        api_key
    )

    total_activities = 0
    total_days = 0

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

            # 1. Leggi le attività Garmin
            activities = fetch_activities(
                garmin,
                current,
                chunk_end,
            )

            # 2. Leggi i dettagli
            activity_rows = fetch_activity_details(
                garmin,
                activities,
            )

            # 3. Leggi le metriche giornaliere
            daily_rows = fetch_daily_metrics(
                garmin,
                current,
                chunk_end,
            )

            # 4. Salva il blocco su Supabase
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
    log("IMPORTAZIONE MESE COMPLETATA")
    log(f"Mese: {month_string}")
    log(
        f"Attività elaborate: "
        f"{total_activities}"
    )
    log(
        f"Giornate elaborate: "
        f"{total_days}"
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
        log(
            "I blocchi già completati "
            "rimangono salvati."
        )
        log(
            "È possibile ripetere il mese "
            "senza creare duplicati."
        )
        log("================================")

        # Non stampiamo eccezioni complete
        # per evitare di esporre credenziali.
        sys.exit(1)
