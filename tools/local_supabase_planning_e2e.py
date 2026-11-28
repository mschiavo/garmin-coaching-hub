"""Exercise V4.1 Planning RPCs against an isolated local Supabase stack."""
from __future__ import annotations

from datetime import date
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from urllib.parse import unquote, urlsplit

import psycopg
from psycopg.conninfo import make_conninfo
import requests

from tools.local_supabase_e2e import LocalTargetError, read_cli_env
from tools.staging_fixture import fixture_sql


ROOT = Path(__file__).resolve().parents[1]
API_URL_EXPECTED = "http://127.0.0.1:54331"
DB_PORT_EXPECTED = 54332
SYSTEM_ID_RE = re.compile(r"[1-9][0-9]{0,19}")
RPC_FILES = (
    "supabase/bootstrap.sql",
    "supabase/dashboard.sql",
    "supabase/migrations/0034_data_intelligence.sql",
    "supabase/migrations/0035_staging_reliability.sql",
    "supabase/migrations/0036_v41_planning.sql",
    "supabase/migrations/0037_v41_planning_rpc.sql",
)


def _credentials() -> tuple[dict[str, str], str]:
    project_dir = Path(os.environ.get("GCH_SUPABASE_DIR", ""))
    expected_id = os.environ.get("GCH_E2E_EXPECTED_SYSTEM_ID", "")
    if (not project_dir.is_absolute()
            or project_dir != Path(os.environ.get("RUNNER_TEMP", "")) / "gch-v41-planning-rpc"
            or not (project_dir / "supabase" / "config.toml").is_file()
            or not SYSTEM_ID_RE.fullmatch(expected_id)
            or int(expected_id) > 2**64 - 1):
        raise LocalTargetError("Target effimero non identificabile")
    status = subprocess.run(["supabase", "status", "--output", "env"], cwd=project_dir,
                            capture_output=True, text=True, timeout=90, check=False)
    if status.returncode:
        raise LocalTargetError("Stack Supabase locale non disponibile")
    env = read_cli_env(status.stdout)
    api = urlsplit(env["API_URL"])
    dsn = urlsplit(env["DB_URL"])
    if (env["API_URL"] != API_URL_EXPECTED
            or (api.scheme, api.hostname, api.port, api.path, api.query, api.fragment) !=
            ("http", "127.0.0.1", 54331, "", "", "")
            or dsn.scheme not in ("postgres", "postgresql")
            or dsn.hostname != "127.0.0.1" or dsn.port != DB_PORT_EXPECTED
            or dsn.path != "/postgres" or dsn.username != "postgres"
            or not dsn.password or dsn.query or dsn.fragment):
        raise LocalTargetError("Target locale fuori dai binding attesi")
    if not env["ANON_KEY"] or "\n" in env["ANON_KEY"]:
        raise LocalTargetError("Chiave locale publishable non disponibile")
    options = {
        "host": "127.0.0.1", "port": DB_PORT_EXPECTED, "dbname": "postgres",
        "user": "postgres", "password": unquote(dsn.password), "connect_timeout": 10,
    }
    with psycopg.connect(make_conninfo(**options)) as conn:
        actual = conn.execute("SELECT system_identifier::text FROM pg_catalog.pg_control_system()").fetchone()[0]
        if actual != expected_id:
            raise LocalTargetError("Identità cluster non corrispondente")
        for relative in RPC_FILES:
            conn.execute((ROOT / relative).read_text(encoding="utf-8"), prepare=False)
        conn.execute(fixture_sql(date.today(), False, database="postgres", system_id=expected_id,
                                 local_supabase=True), prepare=False)
    return env, expected_id


def _post(session: requests.Session, base: str, key: str, path: str, payload: dict,
          token: str | None = None) -> requests.Response:
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return session.post(base + path, headers=headers, json=payload, timeout=20,
                        allow_redirects=False)


def _login(session: requests.Session, base: str, key: str, email: str, password: str) -> str:
    response = _post(session, base, key, "/auth/v1/token?grant_type=password",
                     {"email": email, "password": password})
    if response.status_code != 200:
        raise LocalTargetError("Login sintetico rifiutato")
    token = response.json().get("access_token")
    if not isinstance(token, str) or not token:
        raise LocalTargetError("Sessione sintetica incompleta")
    return token


def _rpc(session: requests.Session, base: str, key: str, name: str, payload: dict,
         token: str | None = None) -> requests.Response:
    return _post(session, base, key, f"/rest/v1/rpc/{name}", payload, token)


def run() -> None:
    env, system_id = _credentials()
    base, key = env["API_URL"], env["ANON_KEY"]
    allowed_email = f"planning-allowed-{secrets.token_hex(8)}@example.invalid"
    denied_email = f"planning-denied-{secrets.token_hex(8)}@example.invalid"
    allowed_password = secrets.token_urlsafe(30)
    denied_password = secrets.token_urlsafe(30)
    with requests.Session() as http:
        http.trust_env = False
        accounts = []
        for email, password in ((allowed_email, allowed_password), (denied_email, denied_password)):
            created = _post(http, base, key, "/auth/v1/signup", {"email": email, "password": password})
            if created.status_code not in (200, 201):
                raise LocalTargetError("Creazione utente Auth sintetico non riuscita")
            body = created.json()
            value = body.get("user", body) if isinstance(body, dict) else {}
            user_id = value.get("id") if isinstance(value, dict) else None
            if not isinstance(user_id, str):
                raise LocalTargetError("Utente Auth sintetico senza id")
            accounts.append(user_id)

        dsn = urlsplit(env["DB_URL"])
        with psycopg.connect(make_conninfo(host="127.0.0.1", port=DB_PORT_EXPECTED, dbname="postgres",
                                           user="postgres", password=unquote(dsn.password), connect_timeout=10)) as conn:
            current = conn.execute("SELECT system_identifier::text FROM pg_catalog.pg_control_system()").fetchone()[0]
            if current != system_id:
                raise LocalTargetError("Identità PostgreSQL cambiata durante il test")
            conn.execute("INSERT INTO dashboard_private.allowed_users(user_id) VALUES (%s)", (accounts[0],))

        anonymous = _rpc(http, base, key, "planning_list_cycles_v1", {})
        if anonymous.status_code != 401 or anonymous.json().get("code") != "42501":
            raise LocalTargetError("RPC Planning accessibile senza sessione")

        allowed_token = _login(http, base, key, allowed_email, allowed_password)
        cycle_response = _rpc(http, base, key, "planning_create_cycle_v1", {
            "p_name": "Synthetic API plan", "p_start_date": "2026-08-03", "p_end_date": "2026-08-30",
            "p_timezone": "Europe/Rome", "p_status": "draft",
        }, allowed_token)
        if cycle_response.status_code != 200:
            raise LocalTargetError("Creazione ciclo RPC non riuscita")
        cycle = cycle_response.json().get("cycle", {})
        cycle_id = cycle.get("id")
        revision = cycle.get("revision")
        if not isinstance(cycle_id, str) or revision != "1":
            raise LocalTargetError("Risposta ciclo RPC incompleta")

        session_response = _rpc(http, base, key, "planning_create_session_v1", {
            "p_session_date": "2026-08-05", "p_sport": "running", "p_session_type": "easy",
            "p_title": "Synthetic session", "p_cycle_id": cycle_id, "p_week_start": "2026-08-03",
            "p_target_distance_m": 5000,
        }, allowed_token)
        if session_response.status_code != 200:
            raise LocalTargetError("Creazione seduta RPC non riuscita")
        session_id = session_response.json().get("session", {}).get("id")
        if not isinstance(session_id, str):
            raise LocalTargetError("Risposta seduta RPC incompleta")

        page = _rpc(http, base, key, "planning_list_cycles_v1", {"p_status": "draft", "p_limit": 10}, allowed_token)
        if page.status_code != 200 or cycle_id not in [row.get("id") for row in page.json().get("rows", [])]:
            raise LocalTargetError("Lettura/persistenza ciclo RPC non riuscita")
        update = _rpc(http, base, key, "planning_update_cycle_v1", {
            "p_id": cycle_id, "p_expected_revision": "1", "p_patch": {"name": "Synthetic plan updated"},
        }, allowed_token)
        if update.status_code != 200 or update.json().get("cycle", {}).get("revision") != "2":
            raise LocalTargetError("Aggiornamento ciclo o revisione non riusciti")
        conflict = _rpc(http, base, key, "planning_update_cycle_v1", {
            "p_id": cycle_id, "p_expected_revision": "1", "p_patch": {"name": "stale write"},
        }, allowed_token)
        # PostgREST 16 maps SQLSTATE class 40 (transaction rollback) to HTTP 500;
        # the stable contract is the PostgreSQL code 40001 in the response body.
        if conflict.status_code != 500 or conflict.json().get("code") != "40001":
            raise LocalTargetError("Conflitto di revisione non rilevato")

        session_update = _rpc(http, base, key, "planning_update_session_v1", {
            "p_id": session_id, "p_expected_revision": "1", "p_patch": {"title": "Updated synthetic session"},
        }, allowed_token)
        if session_update.status_code != 200:
            raise LocalTargetError("Aggiornamento seduta RPC non riuscito")
        rescheduled = _rpc(http, base, key, "planning_reschedule_session_v1", {
            "p_id": session_id, "p_expected_revision": "2", "p_session_date": "2026-08-06",
        }, allowed_token)
        if rescheduled.status_code != 200:
            raise LocalTargetError("Riprogrammazione seduta RPC non riuscita")
        cancelled = _rpc(http, base, key, "planning_set_session_status_v1", {
            "p_id": session_id, "p_expected_revision": "3", "p_status": "cancelled", "p_origin": "manual",
        }, allowed_token)
        if cancelled.status_code != 200 or cancelled.json().get("session", {}).get("status") != "cancelled":
            raise LocalTargetError("Annullamento logico seduta non riuscito")

        # Use real Auth logins to switch identity. The second account is valid in Auth,
        # but its RPC is denied by the database allowlist; the first account can log in
        # again and still read the persisted cycle after the switch.
        logout = _post(http, base, key, "/auth/v1/logout", {}, allowed_token)
        if logout.status_code not in (200, 204):
            raise LocalTargetError("Logout account autorizzato non riuscito")
        denied_token = _login(http, base, key, denied_email, denied_password)
        user_check = http.get(base + "/auth/v1/user", headers={"apikey": key, "Authorization": f"Bearer {denied_token}"},
                              timeout=20, allow_redirects=False)
        if user_check.status_code != 200:
            raise LocalTargetError("Account escluso non mantiene una sessione Auth valida")
        denied_call = _rpc(http, base, key, "planning_get_cycle_v1", {"p_id": cycle_id}, denied_token)
        if denied_call.status_code != 403 or denied_call.json().get("code") != "42501":
            raise LocalTargetError("Allowlist non ha negato l'account escluso")
        denied_create = _rpc(http, base, key, "planning_create_cycle_v1", {
            "p_name": "Denied synthetic plan", "p_start_date": "2026-09-01", "p_end_date": "2026-09-07",
            "p_timezone": "UTC", "p_status": "draft",
        }, denied_token)
        if denied_create.status_code != 403 or denied_create.json().get("code") != "42501":
            raise LocalTargetError("Allowlist non ha negato la mutazione dell'account escluso")
        logout = _post(http, base, key, "/auth/v1/logout", {}, denied_token)
        if logout.status_code not in (200, 204):
            raise LocalTargetError("Logout account escluso non riuscito")
        allowed_token = _login(http, base, key, allowed_email, allowed_password)
        persisted = _rpc(http, base, key, "planning_get_cycle_v1", {"p_id": cycle_id}, allowed_token)
        if (persisted.status_code != 200 or persisted.json().get("cycle", {}).get("revision") != "2"
                or persisted.json().get("sessions", [{}])[0].get("status") != "cancelled"):
            raise LocalTargetError("Persistenza dopo cambio account non verificata")
        final_page = _rpc(http, base, key, "planning_list_cycles_v1", {"p_limit": 100}, allowed_token)
        if (final_page.status_code != 200
                or any(row.get("name") == "Denied synthetic plan" for row in final_page.json().get("rows", []))):
            raise LocalTargetError("La mutazione rifiutata ha lasciato dati persistiti")

        private = http.get(base + "/rest/v1/plan_cycles?select=id",
                           headers={"apikey": key, "Authorization": f"Bearer {allowed_token}",
                                    "Accept-Profile": "planning_private"}, timeout=20, allow_redirects=False)
        if private.status_code != 406:
            raise LocalTargetError("Schema privato esposto da PostgREST")
    print("Planning RPC E2E: install SQL, Auth allowlist, CRUD, revisione, cambio account e cleanup readiness superati.")


def main() -> None:
    try:
        run()
    except LocalTargetError as exc:
        sys.exit(f"Planning RPC E2E non superato: {exc}.")
    except Exception:
        sys.exit("Planning RPC E2E non superato; dettagli omessi per proteggere credenziali e payload.")


if __name__ == "__main__":
    main()
