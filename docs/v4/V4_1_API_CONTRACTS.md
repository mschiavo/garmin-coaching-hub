# V4.1 — Proposta contratti API Planning & Goals

**Stato:** specifica proposta, nessuna RPC implementata.

## Convenzioni

- RPC autenticate, no accesso diretto browser alle tabelle. Auth+allowlist e scope/ownership verificati server-side. SECURITY DEFINER, `search_path=''`, nomi qualificati, revoke PUBLIC/anon, grant authenticated.
- UUID string; bigint ID stringa decimale; civil date `YYYY-MM-DD`; timestamp ISO UTC; `numeric` stringa decimale. Validazione runtime nel client.
- Mutazioni con `expected_revision`; stale ⇒ `40001` atomico. Page keyset ordinata, limit 1..100, count/has_more/opaque cursor/revision; cursor lega filtri e snapshot.
- API V4 separata da schema V2=34, proposta `planning_*_v1` / `goals_*_v1`. V2 invariata. Legacy fallback solo read; assenza nuova RPC disabilita persistenza, mai fallback write. Preview offline.

## DTO indicativi

```ts
type CivilDate = string; // YYYY-MM-DD, timezone dichiarata
type DecimalString = string; // PostgreSQL NUMERIC
type Revision = string; // BIGINT
type Page<T> = { revision: Revision; count: number; has_more: boolean; next_cursor: string|null; rows: T[] };
type PlanCycle = { id:string; name:string; start_date:CivilDate; end_date:CivilDate; timezone:string; status:string; revision:Revision };
type PlannedSession = { id:string; cycle_id:string|null; week_start:CivilDate|null; session_date:CivilDate; local_time:string|null; sport:string; session_type:string; title:string; target_distance_m:DecimalString|null; target_duration_s:DecimalString|null; status:string; revision:Revision };
type Goal = { id:string; scope:string; metric:string; target:DecimalString; unit:string; direction:string; start_date:CivilDate; end_date:CivilDate; status:string; revision:Revision };
```

Cataloghi sport/tipo/intensità da definire; note bounded/plain text. Sono esempi di contratto, non implementazione.

## RPC proposte

| RPC | Input essenziale | Output/garanzie |
|---|---|---|
| `planning_list_cycles_v1` | range/stati/limit/cursor | pagina filtrata |
| `planning_get_cycle_v1` | cycle UUID | ciclo, settimane annotate, sessioni; no existence oracle |
| `planning_create_cycle_v1` | nome, date, IANA zone, stato | record/revision; range/overlap/zone validati |
| `planning_update_cycle_v1` | id, revision, patch | atomico o 40001; no patch vuota |
| `planning_cancel_cycle_v1` | id/revision | cancel logico, history preservata |
| `planning_list_sessions_v1` | date range/cycle/status/page | ordine date/ordinal/id, bounded |
| `planning_create_session_v1` | cycle/week, data, sport/tipo, target, note | record validato e coerente |
| `planning_update_session_v1` | id/revision/patch | optimistic update |
| `planning_reschedule_session_v1` | id/revision/nuova data/ora | evento history, no activity mutation |
| `planning_set_session_status_v1` | id/revision/status/origine | transition validate, cancelled ≠ skipped |
| `goals_list_v1` | scope/range/status/page | goal typed, no progresso cache |
| `goals_create_v1` | metric/target/unit/direction/period/zone | target validato |
| `goals_update_v1` | id/revision/patch | update versionato |
| `goals_cancel_v1` | id/revision | cancel logico |
| `goals_get_progress_v1` | goal/as-of/source revision | actual/target/gap/coverage/samples/formula version; null se non valido |
| `planning_link_activity_v1` | session, bigint activity string, revision, explicit confirmation | link manuale ad activity esistente |
| `planning_unlink_activity_v1` | session/activity/revision | rimuove solo link, registra evento |

Batch solo atomiche/bounded; consolidamento funzioni ammesso dopo profiling se invarianti uguali.

## Progress result (esempio sintetico)

```json
{"api_version":1,"goal_id":"uuid","as_of":"YYYY-MM-DD","formula_version":"goal-progress-1","metric":"distance","unit":"m","target":"40000","actual":"28000","gap_abs":"-12000","progress_pct":"70","status":"partial","coverage":{"state":"partial","valid_days":5,"unknown_days":2},"samples":{"activities":3}}
```

Percent/gap percent nullable; race-time restituisce delta secondi (meno è meglio), no percentage. Nessun raw Garmin/secret.

## Errori e runtime

`42501` generic denied (nessun UUID leak); `22023` input/range/unit/stato/cursor invalido; `23505` duplicate; `23503` reference missing/non visibile senza oracle; `40001` stale revision (reload/manual reconcile); `PGRST202` API assente ⇒ unavailable, no write fallback. Altri errori neutrali e log senza note/payload/secret.

Cache key include identity, API/schema version, revision, risorsa, filtri, timezone/as-of; logout/cambio account abortisce e invalida; risposta tardiva scartata. Cursor legato a filtri/revision. Activity IDs validati testualmente. Indici candidati cycle/date, sessions `(date,ordinal,id)`, goals `(status,start,end)`, link entrambi i versi; dimensionare con EXPLAIN sintetico. Client prima DB non scrive; DB prima client non cambia V2.
