"""Run approved staging SQL or back up the verified synthetic project."""
import argparse
from datetime import date
import os
from pathlib import Path
import subprocess
import sys

import psycopg
from psycopg.conninfo import make_conninfo

from tools.staging_fixture import fixture_sql, marker_query, staging_connection

FILES = {
    "Fresh": ("supabase/bootstrap.sql", "supabase/dashboard.sql", "supabase/migrations/0034_data_intelligence.sql",
              "supabase/migrations/0035_staging_reliability.sql"),
    "Upgrade33": ("supabase/migrations/0034_data_intelligence.sql", "supabase/migrations/0035_staging_reliability.sql"),
    "Upgrade34": ("supabase/migrations/0035_staging_reliability.sql",),
}


class OperationError(ValueError):
    """A fixed diagnostic safe to show to the operator."""


def install(conn, ref, mode):
    current = conn.execute("""
        SELECT to_regnamespace('coaching') IS NOT NULL,
               to_regprocedure('public.dashboard_data()') IS NOT NULL,
               to_regclass('coaching.intelligence_state') IS NOT NULL,
               to_regprocedure('public.dashboard_metadata_v2(text,text)') IS NOT NULL,
               to_regprocedure('coaching.invalidate_archive_coverage()') IS NOT NULL
    """).fetchone()
    expected = {
        "Fresh": (False, False, False, False, False),
        "Upgrade33": (True, True, False, False, False),
        "Upgrade34": (True, True, True, True, False),
    }
    if current != expected[mode]:
        raise OperationError("Schema iniziale incompatibile con il percorso scelto")
    for path in FILES[mode]:
        marker_query(conn, ref)
        conn.execute(Path(path).read_text(encoding="utf-8"))
        print(f"Applicato {path}", flush=True)


def run_pg(options, command, output=None):
    pg_env = {"PG" + key.upper(): value for key, value in options.items()}
    pg_env["PGCONNECT_TIMEOUT"] = "10"
    env = {key: value for key, value in os.environ.items() if not key.upper().startswith(("PG", "GCH_", "VITE_"))}
    result = subprocess.run(
        command,
        env=env | pg_env, stdout=output, stderr=subprocess.DEVNULL, check=False,
    )
    if result.returncode:
        raise OperationError("Client PostgreSQL interrotto. Verificare permessi, TLS, schema e versione client")


def backup(options, output, pg_dump):
    run_pg(options, [pg_dump, "--no-password", "--format=custom", "--schema=coaching",
                     "--schema=dashboard_private", "--schema=public",
                     "--exclude-table-data=dashboard_private.allowed_users",
                     "--exclude-table-data=dashboard_private.staging_identity"], output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", choices=("Verify", "Snapshot", "Install", "Fixture", "Backup"))
    parser.add_argument("--approved-project-ref", required=True)
    parser.add_argument("--mode", choices=FILES, default="Fresh")
    parser.add_argument("--reference", type=date.fromisoformat, default=date(2024, 3, 5))
    parser.add_argument("--size", choices=("small", "large"), default="large")
    parser.add_argument("--legacy", action="store_true")
    parser.add_argument("--pg-dump")
    parser.add_argument("--psql")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        ref, options = staging_connection(os.environ)
        if args.approved_project_ref != ref:
            raise OperationError("Autorizzazione e ref staging discordanti")
        with psycopg.connect(make_conninfo(**options, connect_timeout=10), autocommit=True) as conn:
            marker_query(conn, ref)
            if args.task == "Install":
                install(conn, ref, args.mode)
            elif args.task == "Fixture":
                conn.execute(fixture_sql(args.reference, args.size == "large", ref, args.legacy))
            elif args.task == "Snapshot":
                if not args.psql:
                    raise OperationError("Serve il binario psql")
                run_pg(options, [args.psql, "-X", "-w", "-At", "-v", "ON_ERROR_STOP=1",
                                 "-c", "BEGIN READ ONLY", "-f", "tools/staging_snapshot.sql"])
            elif args.task == "Backup":
                if not args.output or not args.pg_dump:
                    raise OperationError("Servono destinazione backup e binario pg_dump")
                with args.output.open("xb") as output:
                    backup(options, output, args.pg_dump)
        print(f"Staging {args.task} completato.")
    except OperationError as exc:
        sys.exit(str(exc))
    except Exception:
        sys.exit(f"Staging {args.task} interrotto. Verificare ambiente, marker e stato schema.")


if __name__ == "__main__":
    main()
