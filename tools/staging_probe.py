"""Read-only application probes for an explicitly identified Supabase staging project."""
import argparse
from datetime import date
import os
import re
import sys

import psycopg
from psycopg.conninfo import make_conninfo
import requests

from tools.staging_fixture import StagingTargetError, marker_query, staging_connection

COLLECTIONS = ("activities", "daily", "coverage")


class ProbeError(ValueError):
    """A failed assertion with a message limited to known probe stages."""


def probe(env, verify_revision_change=False, fixture_size=None):
    ref, options = staging_connection(env)
    key = env.get("GCH_STAGING_SUPABASE_PUBLISHABLE_KEY", "")
    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", key):
        raise ProbeError("Chiave publishable richiesta")
    credentials = [
        (env.get(f"GCH_STAGING_{role}_EMAIL"), env.get(f"GCH_STAGING_{role}_PASSWORD"))
        for role in ("ALLOWED", "DENIED")
    ]
    if not all(email and password for email, password in credentials) or credentials[0][0] == credentials[1][0]:
        raise ProbeError("Servono due account sintetici distinti")
    with psycopg.connect(make_conninfo(**options, connect_timeout=10)) as conn:
        conn.read_only = True
        marker_query(conn, ref)
    with requests.Session() as http:
        http.trust_env = False
        http.headers["apikey"] = key
        base = env["GCH_STAGING_SUPABASE_URL"]

        def request(method, path, body=None, jwt=None, profile=None):
            headers = {}
            if jwt:
                headers["Authorization"] = f"Bearer {jwt}"
            if profile:
                headers["Accept-Profile"] = profile
            return http.request(method, base + path, json=body, headers=headers,
                                timeout=20, allow_redirects=False)

        def rpc(function, args, jwt):
            return request("POST", "/rest/v1/rpc/" + function, args, jwt)

        def login(pair):
            response = request("POST", "/auth/v1/token?grant_type=password", dict(zip(("email", "password"), pair)))
            if response.status_code != 200:
                raise ProbeError("Login sintetico non riuscito")
            return response.json()

        allowed, denied = map(login, credentials)
        for token in (None, denied["access_token"]):
            for kind in ("data", "metadata_v2", *(f"{kind}_v2" for kind in COLLECTIONS)):
                response = rpc(f"dashboard_{kind}", {} if kind in ("data", "metadata_v2") else {
                    "p_start": "2000-02-29", "p_end": "2000-02-29", "p_revision": "0",
                }, token)
                if response.status_code not in (401, 403):
                    raise ProbeError(f"Accesso inatteso alla RPC {kind}")
        for token in (None, denied["access_token"], allowed["access_token"]):
            for schema, table in (("coaching", "garmin_activities"), ("dashboard_private", "allowed_users")):
                if request("GET", f"/rest/v1/{table}?limit=1", jwt=token, profile=schema).status_code not in (401, 403, 404, 406):
                    raise ProbeError("Esposizione REST diretta inattesa")

        token = allowed["access_token"]

        def read(name, args):
            response = rpc(name, args, token)
            if response.status_code != 200:
                raise ProbeError(f"Lettura staging fallita per {name}")
            return response.json()

        legacy = read("dashboard_data", {})
        if not all(isinstance(legacy[key], list) for key in ("activities", "daily")):
            raise ProbeError("Contratto legacy non valido")
        period = {"p_start": "0001-01-01", "p_end": "9999-12-31"}
        meta = read("dashboard_metadata_v2", period)
        if meta["api_version"] != 2 or meta["schema_version"] != 34 or meta["reliability_version"] != 1:
            raise ProbeError("Capability staging inattesa")
        stale = "0" if meta["revision"] != "0" else "1"
        if verify_revision_change:
            input("Revisione letta. Dopo la scrittura sintetica autorizzata indicata nel runbook, premi Invio: ")
            stale = meta["revision"]
        response = rpc("dashboard_activities_v2", {**period, "p_revision": stale}, token)
        if response.status_code < 400 or response.json().get("code") != "40001":
            raise ProbeError("Una revisione obsoleta deve essere rifiutata")
        if verify_revision_change:
            meta = read("dashboard_metadata_v2", period)
        counts = {}
        bigint = False
        for kind in COLLECTIONS:
            params = {**period, "p_revision": meta["revision"], "p_limit": 250}
            count, previous, ids = 0, None, set()
            while True:
                page = read(f"dashboard_{kind}_v2", params)
                rows = page["rows"]
                count += len(rows)
                if (page["revision"] != meta["revision"] or page["limit"] != 250 or
                        len(rows) != page["count"] or len(rows) > 250 or count > meta[kind]["count"]):
                    raise ProbeError("Pagina o revisione incoerente")
                last = None
                for row in rows:
                    day = date.fromisoformat(row["date"]).isoformat()
                    last = {"date": day}
                    order = (day,)
                    if kind == "activities":
                        identifier = row["id"]
                        if not isinstance(identifier, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", identifier) or identifier in ids:
                            raise ProbeError("ID sintetico non valido o duplicato")
                        ids.add(identifier)
                        bigint |= int(identifier) > 2**53
                        last["key"] = identifier
                        order += (int(identifier),)
                    elif kind == "coverage":
                        last["key"] = row["source"]
                        order += (row["source"],)
                    if previous is not None and order <= previous:
                        raise ProbeError("Cursore non crescente")
                    previous = order
                if not page["has_more"]:
                    if page["next_cursor"] is not None or count != meta[kind]["count"]:
                        raise ProbeError("Conteggio finale o cursore incoerente")
                    break
                if len(rows) != 250 or count >= meta[kind]["count"] or page["next_cursor"] != last:
                    raise ProbeError("Paginazione incoerente")
                params["p_after_date"] = last["date"]
                if "key" in last:
                    params["p_after_key"] = last["key"]
            counts[kind] = count

        if fixture_size:
            expected = (9, 8, 6) if fixture_size == "small" else (2502, 2501, 6)
            if tuple(counts[kind] for kind in COLLECTIONS) != expected or not bigint:
                raise ProbeError("La fixture richiesta non coincide con i dati trasferiti")
        refreshed = request("POST", "/auth/v1/token?grant_type=refresh_token",
                            {"refresh_token": allowed["refresh_token"]})
        if refreshed.status_code != 200 or refreshed.json()["user"]["id"] != allowed["user"]["id"]:
            raise ProbeError("Refresh Auth non riuscito")
        # Sessione sintetica del probe, nessuna modifica alle tabelle applicative.
        for session in (refreshed.json(), denied):
            if request("POST", "/auth/v1/logout?scope=local", jwt=session["access_token"]).status_code != 204:
                raise ProbeError("Logout Auth non riuscito")
        print(f"REST staging verificato. Righe {counts}. Bigint oltre 2^53 presente: {bigint}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-revision-change", action="store_true")
    parser.add_argument("--fixture-size", choices=("small", "large"), help="Verifica anche i conteggi esatti della fixture fresh install")
    args = parser.parse_args()
    try:
        probe(os.environ, args.verify_revision_change, args.fixture_size)
    except (StagingTargetError, ProbeError) as exc:
        sys.exit(f"Controllo staging fallito. {exc}.")
    except Exception:
        sys.exit("Controllo staging fallito. Verificare configurazione, marker, Auth e migrazioni.")
