# V4.1 — Audit dei dati esistenti

**Stato:** audit documentale sul checkout V4; nessuna modifica al codice o ai contratti. **Baseline:** branch `feature/v4-visual-foundation`, HEAD `379c6c471289219ade88efd31c9a2bb41915abdd`. **Limite:** analisi statica; nessun accesso a Supabase, Garmin o NAS. Copertura effettiva dipende dall'installazione.

## Sintesi

Archivio: attività per ID/giorno civile, metriche giornaliere per data, tentativi/evidenze coverage per data e sorgente. Le tabelle non sono accessibili direttamente ai ruoli API; la lettura passa da RPC `SECURITY DEFINER` che verificano `auth.uid()` contro allowlist dell'installazione. Non esiste `athlete_id`/`user_id` sulle righe Garmin né un'associazione dimostrata fra account allowlisted e atleta. L'allowlist consente l'accesso all'archivio condiviso; non attribuisce ownership.

Fonti: `supabase/bootstrap.sql`, `supabase/dashboard.sql`, migrazioni 0034/0035; `sync_garmin.py`, `import_garmin_history.py`, `garmin_coverage.py`; `dashboard/src/dataApi.ts`, `dashboard/src/analytics/dates.ts`, `dashboard/src/main.tsx`; `dashboard/src/components/v4/DashboardPreview.tsx`. La preview è sintetica/offline, non un contratto dati.

## Matrice campo → storage → RPC → tipo frontend → consumatore

| Dato | Storage fisico/nullabilità | Tempo e qualità | RPC/tipo frontend | Consumatori e limiti |
|---|---|---|---|---|
| ID attività | `coaching.garmin_activities.activity_id bigint PRIMARY KEY NOT NULL` | ID sorgente; writer valida positivo e nel range signed bigint | `dashboard_activities_v2` serializza bigint come stringa; `ActivityRow.id: number|string`, parser V2 richiede stringa decimale | Archivio, Training Load, Analytics; non duplicare per Planning |
| Data attività | `activity_date date NULL` | Giorno civile da `startTimeLocal` via `datetime.fromisoformat(...).date()` (`sync_garmin.py`); `GARMIN_TIMEZONE` default `Europe/Rome` definisce intervalli/oggi, non è UTC instant | V1 testo; V2 filtro/cursore; `ActivityRow.date: string` | Grafici/calendario; null storico è anomalia; distinta da `synced_at` |
| Tipo attività | `activity_type text NULL` | Tassonomia provider, non enum stabile garantito | `type: string|null` | `main.tsx`/`dates.ts` distinguono running/trail_running; tipi Planning distinti |
| Payload attività | `raw_data jsonb NOT NULL` (summary/detail) | Campi validati dal writer e opzionali per dispositivo/risposta | V1 name/distanza m/durata s/FC media; V2 estesi in `extendedFields` (`dates.ts`: elevazione, cadenza, potenza, temperatura, split, zone FC); `ActivityRow` nullabile | Dati assenti restano null; raw writer-owned; no inferenze fisiologiche |
| Sync | `synced_at timestamptz NOT NULL DEFAULT now()` | Istante UTC di scrittura, diverso dal giorno attività | Metadata V2 `updated_at: string|null` | Freschezza archivio |
| Data metriche | `metric_date date PRIMARY KEY NOT NULL` | Giorno civile; `import_garmin_history.py` usa `GARMIN_TIMEZONE` | V2 daily `date: string` | `DailyRow`; non prova completezza delle misure |
| Sonno | `sleep_data jsonb NULL`, estratto `sleepTimeSeconds / 3600` | Ore se numerico valido | `DailyRow.sleep_h: number|null` | Recovery; assenza ≠ zero |
| HRV | `hrv_data jsonb NULL`, `hrvSummary.lastNightAvg` | Osservazione Garmin, ma normalizzato non conserva tutta la semantica/versione sensore | `DailyRow.hrv: number|null` | Recovery; solo confronti omogenei |
| FC riposo | `daily_summary jsonb NULL`, path `data[0].heartRate.restingValue` | Semantica payload Garmin | `DailyRow.resting_hr: number|null` | Recovery |
| Stress | `stress_data jsonb NULL`, `values.overallStressLevel` | Scala Garmin, non readiness/diagnosi | `DailyRow.stress: number|null` | Recovery con provenienza |
| Body Battery | `body_battery_data jsonb NULL`, charged/drained | Misure distinte, non saldo/target | `DailyRow.bb_charged`, `bb_drained: number|null` | Recovery |
| Passi | `daily_summary jsonb NULL`, `movement.steps.value` | Conteggio giornaliero | `DailyRow.steps: number|null` | Dashboard |
| Coverage | `import_coverage`: `day date`, `source text`, `attempt_state text`, `attempted_at timestamptz`, `evidence text NULL`, `succeeded_at timestamptz NULL`, `item_count integer NULL`, `quality text NULL`, `error_code text NULL`; PK `(day,source)` | 0034: success-with-data/empty, failed, unsupported, partial; success_empty ammesso solo activities. Nessuna riga = ignoto | `dashboard_coverage_v2`; `Coverage` in `dataApi.ts` | Quality Center; `record()` conserva evidenza precedente su tentativo fallito |
| Riconciliazione | 0035: `reconciliation text NULL` (verified/conflict/invalidated), observed/missing_count integer NULL | Mutazioni possono invalidare attestazioni; null inconclusivo | V2 coverage campi opzionali | Qualità; null non è verified |
| Metadata/revision | `intelligence_state.singleton bool PK`, `schema_version integer`, `revision bigint` | Revision globale trigger; trasmessa come stringa, non per-riga | Metadata V2 api 2/schema 34, revision, extent, anomalies, coverage status, updated_at | `readArchive` controlla paginazione/revision |
| Identità | `allowed_users.user_id uuid PK REFERENCES auth.users(id) ON DELETE CASCADE`, created_at timestamptz | Allowlist installazione; delete Auth cascada membership | V1 `dashboard_data()` e V2 `dashboard_private.check_v2()` richiedono auth.uid allowlisted | `main.tsx` abortisce e azzera dati su cambio identity; nessuna ownership atleta |

## Contratti e sicurezza verificati

- `dashboard_data()` (`dashboard.sql`): SECURITY DEFINER, `search_path=''`, auth+allowlist, massimo 2.000 righe.
- 0034: `dashboard_metadata_v2`, `dashboard_activities_v2`, `dashboard_daily_v2`, `dashboard_coverage_v2`; date, limiti, cursor, revision validati; bigint ID testuale. Schemi/tabelle private revocati ad anon/authenticated.
- 0035 aggiunge reconciliation/invalidation e aggiorna metadata/coverage, non ownership o Planning.
- Test sintetici: `tests/sql/test_intelligence.py`, `tests/sql/test_reliability.py`, `tests/test_local_supabase_e2e.py`, `tests/sql/auth_stub.sql`; provano fixture, non copertura live.
- `dataApi.ts` fa fallback legacy solo se V2 manca; mai usarlo come fallback di scrittura.

## Gap V4.1

Nessuna API/tabella persistente per cicli, settimane, sessioni, goal, milestone, target, note, revision per entità, link sessione-attività, change history, gare o preferenze remote. Preview non fa rete e non è schema. Nessuna timezone di piano persistita. Installazione implicita in database/progetto, non `installation_id`. Il writer Python muta archivio/coverage con connessione privilegiata; non deve ottenere grant Planning. VDOT/VO₂max derivato/readiness sono fuori dalla persistenza V4.1.

## Riferimenti

`bootstrap.sql`; `dashboard.sql`; `0034_data_intelligence.sql`; `0035_staging_reliability.sql`; `sync_garmin.py` (`fetch_activity_details`); `import_garmin_history.py` (`TIMEZONE`); `garmin_coverage.py` (`record`, `activity_import`, `daily_import`, writer/lock); `dataApi.ts` (`Coverage`, `Metadata`, `readArchive`); `analytics/dates.ts` (`ActivityRow`, `DailyRow`); `main.tsx` (Auth listener/session identity); preview V4; `V4_PRODUCT_SPEC_v1_1.md`, `V4_ARCHITECTURE_ADR.md`.
