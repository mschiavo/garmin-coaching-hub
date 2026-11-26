"""Synthetic end-to-end probes for an ephemeral, local Supabase stack only."""
from __future__ import annotations

import argparse
from datetime import date
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
from urllib.parse import urlsplit

import psycopg
import requests
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from tools.staging_fixture import fixture_sql

DB_NAME = "postgres"
LOCAL_HOST = "127.0.0.1"
LOCAL_PORT = "54322"
API_BASE = "http://127.0.0.1:54321"
SYSTEM_ID = re.compile(r"[1-9][0-9]{0,19}\Z")
ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


class LocalTargetError(ValueError):
    """Safe validation error: never contains connection inputs."""


def dashboard_failure_summary(output: str, returncode: int) -> str:
    """Return allowlisted Playwright diagnostics without echoing captured output."""
    if returncode == 0:
        return "category=success"
    safe_output = ANSI_ESCAPE.sub("", output)
    if re.search(r"Timeout(?:Error)?|timed out|\d+ms exceeded", safe_output, re.IGNORECASE):
        category = "timeout"
    elif re.search(r"browserType\.launch|Executable doesn't exist", safe_output, re.IGNORECASE):
        category = "browser_setup"
    elif re.search(r"ERR_CONNECTION|page\.goto", safe_output, re.IGNORECASE):
        category = "preview_or_api_connection"
    elif re.search(r"expect\([^\n]*failed", safe_output, re.IGNORECASE):
        category = "assertion_failure"
    else:
        category = "playwright_failure_unclassified"

    fields = [f"category={category}"]
    if "live local Supabase login, analytics, account switch and logout" in safe_output:
        fields.append("test=live_local_supabase_dashboard")
    else:
        fields.append("test=unidentified")
    source = re.search(r"tests[/\\]supabase\.integration\.spec\.ts:(\d+):\d+", safe_output)
    if source:
        fields.append(f"source_line={source.group(1)}")
    matcher = re.search(
        r"\.(toBeVisible|toContainText|toHaveCount|toBeTruthy|toBeGreaterThan)\(",
        safe_output,
    )
    if matcher:
        fields.append(f"matcher={matcher.group(1)}")
    fields.append(f"exit_code={returncode}")
    return " ".join(fields)


def validate_local_database(dsn: str, expected_system_id: str, database: str) -> dict[str, str]:
    try:
        options = conninfo_to_dict(dsn)
    except Exception:
        raise LocalTargetError("DSN locale non valido") from None
    if (set(options) - {"host", "port", "dbname", "user", "password"}
            or database != DB_NAME
            or options.get("host") != LOCAL_HOST
            or options.get("port") != LOCAL_PORT
            or options.get("dbname") != database
            or options.get("user") != "postgres"
            or not options.get("password")
            or not SYSTEM_ID.fullmatch(expected_system_id)
            or int(expected_system_id) > 2**64 - 1):
        raise LocalTargetError("Destinazione DB locale o identità cluster rifiutata")
    return options


def validate_api_url(value: str) -> str:
    parsed = urlsplit(value)
    if (parsed.username or parsed.password
            or (parsed.scheme, parsed.hostname, parsed.port, parsed.path, parsed.query, parsed.fragment) != (
                "http", "127.0.0.1", 54321, "", "", "")):
        raise LocalTargetError("API non locale rifiutata")
    return value


def _conn(dsn: str, system_id: str, db: str):
    options = validate_local_database(dsn, system_id, db)
    conn = psycopg.connect(make_conninfo(**options, connect_timeout=10))
    actual = conn.execute("SELECT system_identifier::text FROM pg_catalog.pg_control_system()").fetchone()[0]
    if actual != system_id:
        conn.close()
        raise LocalTargetError("Identificatore del cluster non corrispondente")
    return conn


def _auth_request(session: requests.Session, base: str, key: str, path: str, body: dict,
                  token: str | None = None):
    headers = {"apikey": key}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return session.post(f"{base}{path}", headers=headers, json=body, timeout=20,
                        allow_redirects=False)


def _rpc(session: requests.Session, base: str, key: str, name: str, body: dict,
         token: str | None = None):
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return session.post(f"{base}/rest/v1/rpc/{name}", headers=headers, json=body,
                        timeout=20, allow_redirects=False)


def prepare(env: dict[str, str]) -> None:
    """Install SQL/fixture and exercise Auth, PostgREST and the live browser."""
    base = validate_api_url(env.get("API_URL", API_BASE))
    system_id = env.get("GCH_E2E_EXPECTED_SYSTEM_ID", "")
    dsn_url = env.get("DB_URL", "")
    parsed = urlsplit(dsn_url)
    if (parsed.scheme not in ("postgres", "postgresql") or parsed.hostname != LOCAL_HOST
            or parsed.port != int(LOCAL_PORT) or parsed.path != "/postgres"
            or parsed.username != "postgres" or not parsed.password
            or parsed.query or parsed.fragment):
        raise LocalTargetError("Connessione CLI non loopback rifiutata")
    admin_dsn = make_conninfo(host=LOCAL_HOST, port=LOCAL_PORT, dbname="postgres",
                              user="postgres", password=parsed.password)
    target = _conn(admin_dsn, system_id, DB_NAME)
    try:
        files = [Path("supabase/bootstrap.sql"),
                 Path("supabase/dashboard.sql"), Path("supabase/migrations/0034_data_intelligence.sql"),
                 Path("supabase/migrations/0035_staging_reliability.sql")]
        for file in files:
            target.execute(file.read_text(encoding="utf-8"), prepare=False)
        target.execute(fixture_sql(date.today(), True, database=DB_NAME, system_id=system_id,
                                   local_supabase=True), prepare=False)
    finally:
        target.close()

    anon_key = env.get("ANON_KEY", "")
    if not anon_key or "\n" in anon_key:
        raise LocalTargetError("Chiave locale publishable non disponibile")
    allowed_email = f"allowed-{secrets.token_hex(8)}@example.invalid"
    denied_email = f"denied-{secrets.token_hex(8)}@example.invalid"
    allowed_password, denied_password = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    with requests.Session() as http:
        http.trust_env = False
        users = []
        for email, password in ((allowed_email, allowed_password), (denied_email, denied_password)):
            response = _auth_request(http, base, anon_key, "/auth/v1/signup", {"email": email, "password": password})
            if response.status_code not in (200, 201):
                raise LocalTargetError("Creazione account Auth sintetico non riuscita")
            body = response.json()
            user = body.get("user", body)
            if not user.get("id"):
                raise LocalTargetError("Account Auth sintetico senza identificatore")
            users.append(user["id"])
        with psycopg.connect(make_conninfo(host=LOCAL_HOST, port=LOCAL_PORT, dbname=DB_NAME,
                                           user="postgres", password=parsed.password)) as target:
            if target.execute("SELECT system_identifier::text FROM pg_catalog.pg_control_system()").fetchone()[0] != system_id:
                raise LocalTargetError("Identità cluster cambiata durante il setup")
            target.execute("INSERT INTO dashboard_private.allowed_users(user_id) VALUES (%s)", (users[0],))

        tokens = []
        for email, password in ((allowed_email, allowed_password), (denied_email, denied_password)):
            response = _auth_request(http, base, anon_key, "/auth/v1/token?grant_type=password",
                                     {"email": email, "password": password})
            if response.status_code != 200:
                raise LocalTargetError("Login Auth sintetico non riuscito")
            tokens.append(response.json())

        # Anonymous and authenticated-but-not-allowlisted users must not invoke either RPC contract.
        probe_args = {"p_start": "2024-01-01", "p_end": "2024-01-02", "p_revision": "0", "p_limit": 1}
        for name, args in (("dashboard_data", {}), ("dashboard_metadata_v2", {}),
                           ("dashboard_activities_v2", probe_args)):
            for token in (None, tokens[1]["access_token"]):
                if _rpc(http, base, anon_key, name, args, token).status_code not in (401, 403):
                    raise LocalTargetError("RPC ha accettato un soggetto non autorizzato")

        for schema, table in (("coaching", "garmin_activities"),
                              ("dashboard_private", "allowed_users")):
            response = http.get(f"{base}/rest/v1/{table}?limit=1",
                                headers={"apikey": anon_key, "Authorization": f"Bearer {tokens[0]['access_token']}",
                                         "Accept-Profile": schema}, timeout=20, allow_redirects=False)
            if response.status_code not in (401, 403, 404, 406):
                raise LocalTargetError("Schema privato accessibile da PostgREST")

        token = tokens[0]["access_token"]
        legacy = _rpc(http, base, anon_key, "dashboard_data", {}, token)
        metadata = _rpc(http, base, anon_key, "dashboard_metadata_v2",
                        {"p_start": "0001-01-01", "p_end": "9999-12-31"}, token)
        if legacy.status_code != 200 or metadata.status_code != 200:
            raise LocalTargetError("RPC legacy o metadata V2 non disponibile")
        meta = metadata.json()
        if meta.get("schema_version") != 34 or meta.get("api_version") != 2 or meta.get("reliability_version") != 1:
            raise LocalTargetError("Capability API V2 inattesa")

        counts: dict[str, int] = {}
        bigint = False
        for kind in ("activities", "daily", "coverage"):
            args = {"p_start": "0001-01-01", "p_end": "9999-12-31",
                    "p_revision": meta["revision"], "p_limit": 250}
            received = 0
            while True:
                response = _rpc(http, base, anon_key, f"dashboard_{kind}_v2", args, token)
                if response.status_code != 200:
                    raise LocalTargetError("RPC paginata non riuscita")
                page = response.json()
                rows = page.get("rows")
                if (not isinstance(rows, list) or page.get("revision") != meta["revision"]
                        or page.get("count") != len(rows) or page.get("limit") != 250):
                    raise LocalTargetError("Risposta paginata incompleta o incoerente")
                received += len(rows)
                if kind == "activities":
                    for row in rows:
                        ident = row.get("id")
                        if not isinstance(ident, str) or not ident.isdecimal():
                            raise LocalTargetError("ID bigint serializzato in modo inatteso")
                        bigint |= int(ident) > 2**53
                if not page.get("has_more"):
                    if page.get("next_cursor") is not None or received != meta[kind]["count"]:
                        raise LocalTargetError("Conteggio o cursore finale incoerente")
                    break
                cursor = page.get("next_cursor")
                if not cursor or len(rows) != 250:
                    raise LocalTargetError("Paginazione incompleta")
                args["p_after_date"] = cursor["date"]
                if "key" in cursor:
                    args["p_after_key"] = cursor["key"]
            counts[kind] = received
        if tuple(counts.values()) != (2502, 2501, 6) or not bigint:
            raise LocalTargetError("Conteggi della fixture sintetica non corrispondenti")

        stale = str(int(meta["revision"]) + 1)
        stale_response = _rpc(http, base, anon_key, "dashboard_activities_v2",
                              {"p_start": "0001-01-01", "p_end": "9999-12-31",
                               "p_revision": stale, "p_limit": 1}, token)
        if stale_response.status_code < 400 or stale_response.json().get("code") != "40001":
            raise LocalTargetError("Revisione obsoleta non rifiutata")
        # Change a synthetic row, proving a fresh revision is observed over HTTP.
        with psycopg.connect(make_conninfo(host=LOCAL_HOST, port=LOCAL_PORT, dbname=DB_NAME,
                                           user="postgres", password=parsed.password)) as target:
            target.execute("UPDATE coaching.garmin_activities SET synced_at=clock_timestamp() WHERE activity_id=9007199254740993")
        changed = _rpc(http, base, anon_key, "dashboard_metadata_v2",
                       {"p_start": "0001-01-01", "p_end": "9999-12-31"}, token)
        if changed.status_code != 200 or changed.json().get("revision") == meta["revision"]:
            raise LocalTargetError("Invalidazione revisione non osservata via PostgREST")
        invalid = _rpc(http, base, anon_key, "dashboard_activities_v2",
                       {"p_start": "not-a-date", "p_end": "2024-01-01",
                        "p_revision": changed.json()["revision"], "p_limit": 1}, token)
        if invalid.status_code < 400 or "rows" in invalid.json():
            raise LocalTargetError("Errore RPC non restituito senza dati parziali")

        refreshed = _auth_request(http, base, anon_key, "/auth/v1/token?grant_type=refresh_token",
                                  {"refresh_token": tokens[0]["refresh_token"]})
        if refreshed.status_code != 200:
            raise LocalTargetError("Refresh Auth non riuscito")
        for session in (refreshed.json(), tokens[1]):
            response = http.post(f"{base}/auth/v1/logout?scope=local",
                                 headers={"apikey": anon_key, "Authorization": f"Bearer {session['access_token']}"},
                                 timeout=20, allow_redirects=False)
            if response.status_code != 204:
                raise LocalTargetError("Logout Auth non riuscito")

    print("Local Supabase: SQL install/fixture, Auth, RPC legacy/V2, ACL, paginazione e revisione superati.")
    dashboard_env = os.environ.copy()
    dashboard_env.update({
        "VITE_SUPABASE_URL": base,
        "VITE_SUPABASE_PUBLISHABLE_KEY": anon_key,
        "VITE_GARMIN_TIMEZONE": "Europe/Rome",
        "GCH_E2E_ALLOWED_EMAIL": allowed_email,
        "GCH_E2E_ALLOWED_PASSWORD": allowed_password,
        "GCH_E2E_DENIED_EMAIL": denied_email,
        "GCH_E2E_DENIED_PASSWORD": denied_password,
    })
    try:
        build = subprocess.run(["npm", "run", "build"], cwd="dashboard", env=dashboard_env,
                               capture_output=True, text=True, timeout=300, check=False)
        if build.returncode:
            raise LocalTargetError("Build dashboard con configurazione locale non riuscita")
        result = subprocess.run(["npm", "run", "test:integration"], cwd="dashboard",
                                env=dashboard_env, capture_output=True, text=True,
                                timeout=900, check=False)
    except LocalTargetError:
        raise
    except Exception:
        raise LocalTargetError("Test dashboard live non avviabile") from None
    if result.returncode:
        # Emit only allowlisted categories and static test metadata, never raw output.
        summary = dashboard_failure_summary(result.stdout + "\n" + result.stderr,
                                            result.returncode)
        raise LocalTargetError(f"Test dashboard live non superato ({summary})")
    print("Dashboard live: login, cambio account, analytics e logout superati.")


def read_cli_env(output: str) -> dict[str, str]:
    """Read only the three required local values; never import the generated service key."""
    selected = {"API_URL", "DB_URL", "ANON_KEY"}
    values: dict[str, str] = {}
    try:
        for line in output.splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            if name in selected:
                parts = shlex.split(value, posix=True)
                if len(parts) != 1:
                    raise LocalTargetError("Output CLI locale non valido")
                values[name] = parts[0]
    except LocalTargetError:
        raise
    except Exception:
        raise LocalTargetError("Output CLI locale non leggibile") from None
    if values.keys() != selected:
        raise LocalTargetError("Variabili CLI locali richieste assenti")
    return values


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    try:
        supabase_dir = Path(os.environ.get("GCH_SUPABASE_DIR", ""))
        if not supabase_dir.is_absolute() or not (supabase_dir / "supabase" / "config.toml").is_file():
            raise LocalTargetError("Directory della stack locale non valida")
        status = subprocess.run(["supabase", "status", "--output", "env"], cwd=supabase_dir,
                                capture_output=True, text=True, timeout=90, check=False)
        if status.returncode:
            raise LocalTargetError("Stato della stack locale non disponibile")
        selected = read_cli_env(status.stdout)
        selected["GCH_E2E_EXPECTED_SYSTEM_ID"] = os.environ.get("GCH_E2E_EXPECTED_SYSTEM_ID", "")
        prepare(selected)
    except LocalTargetError as exc:
        sys.exit(f"Collaudo Supabase locale non superato: {exc}.")
    except Exception:
        sys.exit("Collaudo Supabase locale non superato; dettagli omessi per proteggere credenziali e payload.")


if __name__ == "__main__":
    main()
