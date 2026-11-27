# V4.1 — Backlog Planning & Goal Center

**Stato:** piano proposto; non autorizza implementazione persistente.

| Ticket | Dipendenze | Deliverable e Done criteria |
|---|---|---|
| A0 ADR/contratti | Audit | Approvare ownership, timezone, settimana, link cardinality, editing/history, goal catalog/formule; decision log approvato da product/security. |
| A1 migration additiva dopo 0035 | A0 | Schema/constraints/FK/indici/audit/revision/RLS/rollback; fresh install + upgrade; backup/restore sintetico; nessuna modifica storica o grant writer. |
| A2 ACL/RLS | A1 | Matrice anon, autenticato non allowlisted, allowlisted, seconda identity, revoked/deleted; direct schema denied; definer controlla identity/scope; no UUID/cursor/error leak. |
| A3 RPC/SQL contract tests | A1-A2 | CRUD atomico, validazione date/unità, soft cancel, optimistic conflicts, keyset stabile, bigint string, error codes, bounds, V2 compatibile; concurrency su DB effimero. |
| A4 adapter TS e domain math | API approvata; pure functions anticipabili | DTO runtime, precisione, formula versionata, coverage propagation, no fallback write, cache identity/revision, abort session transitions. No fisiologia nuova. |
| A5 Planning CRUD/calendar | A3-A4 | CRUD/reschedule/cancel, week conforme ADR, rest day, accessibilità/mobile, stati empty/partial/offline/stale; no Garmin write. |
| A6 Goal Center | A3-A4 + math approved | Goal week/month/block/race, milestone, formula spiegata, no percent race/zero/null, future exclude, coverage visibile, ring con alternativa testuale. |
| A7 link/reconciliation UI | Cardinalità A0 + A3 | Link/unlink manuale, ambiguity/duplicate, activity update invalida link, fuori piano non diventa sessione. |
| A8 E2E/release gate | A1-A7 | Supabase effimero per migration/Auth/RLS/RPC/backup restore, browser account switch + CRUD + race old response, cleanup always, logs no secrets. Pubblicazione separatamente autorizzata. |

## Offline e dipendenze

Offline: preview demo, validatori, calcoli puri su fixture sintetiche, date/DST e rendering; non provano persistenza/ACL. Supabase effimero richiesto per migration fresh/upgrade, grants/RLS, Auth, RPC, cursori/revisioni, concorrenza, links FK e backup/restore. Dati Garmin autorizzati potranno verificare payload successivamente; mai usare Garmin reale nella CI.

## Definition of Done comune

Regressioni V3.4.1 Auth/session, RPC V2, coverage e writer passano; feature unavailable se API V4 manca (no fallback write); segreti assenti da log/fixture; niente direct grants/production; test errori e concorrenza; timezone e missingness esposti; demo offline marcata; formule con provenienza/campioni; migration additive e restore provati prima di release.
