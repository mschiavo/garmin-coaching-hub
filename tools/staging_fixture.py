"""Generate synthetic SQL for review, or verify the identity of a staging project."""
import argparse
from datetime import date, timedelta
import os
from pathlib import Path
import re

from psycopg.conninfo import conninfo_to_dict

REF = re.compile(r"[a-z0-9]{20}")
LOCAL_DB = "gch_v341_fixture"
UPGRADE_DB = "gch_v341_upgrade"


class StagingTargetError(ValueError):
    """A safe configuration failure whose message contains no input values."""


def staging_ref(env):
    ref = env.get("GCH_STAGING_PROJECT_REF", "")
    production = env.get("GCH_PRODUCTION_PROJECT_REF", "")
    if (env.get("GCH_TARGET") != "staging" or not REF.fullmatch(ref)
            or not REF.fullmatch(production) or ref == production
            or env.get("GCH_STAGING_SUPABASE_URL") != f"https://{ref}.supabase.co"):
        raise StagingTargetError("Identità di staging assente o ambigua")
    return ref


def staging_connection(env):
    ref = staging_ref(env)
    try:
        options = conninfo_to_dict(env.get("GCH_STAGING_DATABASE_URL", ""))
    except Exception:
        raise StagingTargetError("Formato DSN di staging non valido") from None
    ca_path = Path(env.get("GCH_STAGING_DB_CA_FILE", ""))
    ca = options.get("sslrootcert")
    if (
        any(key.startswith("PG") for key in env)
        or set(options) - {"host", "port", "dbname", "user", "password", "sslmode", "sslrootcert"}
        or options.get("host") != f"db.{ref}.supabase.co"
        or options.get("dbname") != "postgres"
        or options.get("port", "5432") != "5432"
        or options.get("sslmode") != "verify-full"
        or (ca != "system" and not (ca and ca_path.is_absolute() and Path(ca) == ca_path and ca_path.is_file()))
        or not options.get("user") or not options.get("password")
    ):
        raise StagingTargetError("Usare una connessione diretta TLS verificata al progetto di staging")
    return ref, options


def marker_query(conn, ref):
    rows = conn.execute("SELECT project_ref FROM dashboard_private.staging_identity").fetchall()
    if rows != [(ref,)]:
        raise StagingTargetError("Marker di staging assente o discordante")


def validate_system_id(value: str) -> str:
    if not re.fullmatch(r"[1-9][0-9]{0,19}", value) or int(value) > 2**64 - 1:
        raise ValueError("Identificatore cluster sintetico non valido")
    return value


def fixture_sql(reference: date, large: bool, ref: str | None = None, legacy: bool = False, *,
                database: str = LOCAL_DB, system_id: str | None = None,
                local_supabase: bool = False):
    if ref is not None and not REF.fullmatch(ref):
        raise ValueError("Project ref non valido")
    if not date(2001, 1, 1) <= reference <= date(9998, 12, 31):
        raise ValueError("Data di riferimento fuori intervallo")
    start = reference - timedelta(days=2500 if large else 7)
    count = 2501 if large else 8
    local_supabase_target = local_supabase and database == "postgres" and system_id is not None
    if ((database not in (LOCAL_DB, UPGRADE_DB) and not local_supabase_target)
            or (ref is not None and system_id is not None)
            or (local_supabase and (ref is not None or system_id is None or database != "postgres"))):
        raise ValueError("Destinazione sintetica non valida")
    if ref is not None:
        target = (f"(SELECT array_agg(project_ref::text) FROM dashboard_private.staging_identity) "
                  f"IS DISTINCT FROM ARRAY['{ref}']::text[]")
    else:
        identity = "inet_server_addr() IS DISTINCT FROM inet '127.0.0.1'"
        if system_id is not None:
            identity = (f"(SELECT system_identifier::text FROM pg_catalog.pg_control_system()) "
                        f"IS DISTINCT FROM '{validate_system_id(system_id)}'")
        target = f"current_database() <> '{database}' OR {identity}"
    coverage_lock = "" if legacy else ", coaching.import_coverage"
    coverage_check = "" if legacy else "OR EXISTS (SELECT FROM coaching.import_coverage)"
    coverage = "" if legacy else f"""
INSERT INTO coaching.import_coverage
  (day,source,attempt_state,attempted_at,evidence,succeeded_at,item_count,quality,error_code,
   reconciliation,observed_count,missing_count)
VALUES
  (DATE '{reference}' - 7,'activities','success_with_data',TIMESTAMPTZ '{reference} 00:00Z',
   'success_with_data',TIMESTAMPTZ '{reference} 00:00Z',1,'validated',NULL,'verified',1,0),
  (DATE '{reference}' - 6,'activities','failed',TIMESTAMPTZ '{reference} 00:00Z',
   'success_with_data',TIMESTAMPTZ '{reference} 00:00Z' - INTERVAL '1 day',1,'validated','http_503','verified',1,0),
  (DATE '{reference}' - 5,'activities','success_empty',TIMESTAMPTZ '{reference} 00:00Z',
   'success_empty',TIMESTAMPTZ '{reference} 00:00Z',0,'source_empty',NULL,'conflict',0,1),
  (DATE '{reference}' - 4,'activities','success_empty',TIMESTAMPTZ '{reference} 00:00Z',
   'success_empty',TIMESTAMPTZ '{reference} 00:00Z',0,'source_empty',NULL,'verified',0,0),
  (DATE '{reference}','activities','partial',TIMESTAMPTZ '{reference} 00:00Z',
   NULL,NULL,NULL,NULL,NULL,NULL,1,0),
  (DATE '{reference}' - 7,'stress','partial',TIMESTAMPTZ '{reference} 00:00Z',
   NULL,NULL,NULL,NULL,'no_valid_measurement',NULL,NULL,NULL);
"""
    return f"""-- Fixture sintetica Garmin Coaching Hub. Revisione manuale prima di eseguire.
BEGIN;
LOCK TABLE coaching.garmin_activities, coaching.garmin_daily_metrics{coverage_lock} IN EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF {target} THEN
    RAISE EXCEPTION 'Destinazione fixture rifiutata';
  END IF;
  IF EXISTS (SELECT FROM coaching.garmin_activities)
     OR EXISTS (SELECT FROM coaching.garmin_daily_metrics) {coverage_check} THEN
    RAISE EXCEPTION 'La fixture richiede un archivio vuoto';
  END IF;
END $guard$;

INSERT INTO coaching.garmin_activities(activity_id,activity_date,activity_type,raw_data,synced_at)
SELECT 9007199254740993 + i, DATE '{start}' + i,
  (ARRAY['running','trail_running','cycling'])[1 + i % 3],
  jsonb_build_object('summary', jsonb_build_object('activityName','Attività sintetica',
    'distance',5000 + i % 100,'duration',1500 + i % 40,'averageHR',140,'elevationGain',0,
    'averageRunningCadenceInStepsPerMinute',166,'hrTimeInZone_2',0)), TIMESTAMPTZ '{reference} 00:00Z'
FROM generate_series(0,{count - 1}) i
WHERE DATE '{start}' + i <> DATE '{reference}' - 4;

INSERT INTO coaching.garmin_activities(activity_id,activity_date,activity_type,raw_data,synced_at) VALUES
  (9010000000000001,DATE '{reference}' - 1,'trail_running','{{"summary":{{"distance":8000,"duration":2700,"elevationGain":340}}}}',TIMESTAMPTZ '{reference} 00:00Z'),
  (9010000000000002,DATE '2000-02-29','running','{{"summary":{{"distance":1000,"duration":400,"averageHR":150}}}}',TIMESTAMPTZ '{reference} 00:00Z'),
  (-1,NULL,'running','{{}}',TIMESTAMPTZ '{reference} 00:00Z');

INSERT INTO coaching.garmin_daily_metrics(metric_date,stress_data,daily_summary,synced_at)
SELECT DATE '{start}' + i, CASE WHEN i % 2 = 0 THEN '[{{"values":{{"overallStressLevel":0}}}}]'::jsonb END,
  '{{"data":[{{"movement":{{"steps":{{"value":0}}}}}}]}}',TIMESTAMPTZ '{reference} 00:00Z'
FROM generate_series(0,{count - 1}) i;
{coverage}
COMMIT;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=date.fromisoformat, required=True)
    parser.add_argument("--size", choices=("small", "large"), default="small")
    parser.add_argument("--target", choices=("local", "staging"), default="local")
    parser.add_argument("--legacy", action="store_true", help="Genera solo righe compatibili con V3.3")
    args = parser.parse_args()
    try:
        ref = staging_connection(os.environ)[0] if args.target == "staging" else None
        print(fixture_sql(args.reference, args.size == "large", ref, args.legacy), end="")
    except Exception:
        parser.exit(1, "Configurazione o data fixture rifiutata.\n")


if __name__ == "__main__":
    main()
