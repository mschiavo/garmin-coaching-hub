# ADR V4.1 — Attuazione locale Planning & Goal Center

**Stato:** decisioni di sviluppo locali approvate dall'utente nel prompt `CODEX_V4_1_UNICO_PROSEGUIMENTO.md`. Non autorizzano accesso cloud, rilascio o deployment. **Ambito:** prototipo e futura migration sul ramo V4; nessuna modifica ai dati V3.4.1.

| # | Decisione attuata | Conseguenza progettuale |
|---|---|---|
| 1 | Ownership per installazione nel Community MVP | Gli account allowlisted condividono piani/goal come l'archivio. Nessun user UUID usato come athlete. Ogni RPC futura deve comunque verificare `auth.uid()` + allowlist. Nessun grant al writer. |
| 2 | Timezone IANA immutabile per ciclo | Default `GARMIN_TIMEZONE` solo se valida alla creazione; il valore viene persistito e non aggiornato da una modifica globale. Non implementare un generic timezone update. |
| 3 | Settimane ISO lunedì–domenica, date civili inclusive | Cicli possono avere settimane parziali ai margini; le date activity Garmin non si riconvertono arbitrariamente da UTC. |
| 4 | Sessioni solo data | Nessun campo orario nel primo schema/form/API. Regole DST verranno definite se e quando un requisito di ora locale sarà approvato. |
| 5 | Una activity collegabile a massimo una sessione; una sessione può avere più activity | Vincolo unique sugli activity link attivi; unlinked storico tramite event/logical state. Solo link manuale confermato; dedup per bigint activity ID; nessuna copia o mutazione Garmin. |
| 6 | Revision optimistic, soft cancel, event log minimo append-only | Eventi created/edited/rescheduled/cancelled/linked/unlinked; niente hard delete nel normale CRUD e nessuna purge automatica. Eventi senza payload Garmin, secret o note ridondanti. |
| 7 | Goal MVP distance (m), duration (s), sessions (intero non negativo), race_time (s) | `at_least` sui primi tre; gara lower-is-better. Progress ring percentuale solo target positivo e unità omogenea; target sessioni zero è rappresentabile ma non produce percentuale. Gara senza percentuale. Costanza/days_active/recovery/readiness fuori contratto persistente. |
| 8 | Nessun auto-link persistente | Link esclusivamente manuale. Activity mutata/rimossa dà `needs_review`/`unresolved`; non altera la sessione né attiva writer Garmin. |

## Regole di calcolo e UX

- Completamento manuale è visibile come tale, distinto dal completamento verificato via activity link. Non aggiunge km/secondi o session count verificati. Aderenza separa manuali e verificati e usa solo sedute scadute/eleggibili.
- Goal volume/durata aggrega activity uniche nella finestra civile del goal, anche fuori piano, con coverage; goal sessions usa completamenti verificati secondo il contratto, manuali separati.
- Zero non osservato non è zero: per activity metric una finestra tutta a zero richiede ogni giorno coverage `activities` con `success_empty`, `item_count=0` e `reconciliation='verified'`. `reconciliation NULL` non attesta zero.
- Periodo aperto confronta actual-to-date con sessioni target già pianificate fino all'as-of solo se tale distribuzione esiste; mai prorata lineare. Future non sono in ritardo.
- Gara memorizza data e tempo target; mostra gap secondi lower-is-better, mai percentuale di preparazione.

## Gate e non-obiettivi

Le scelte sono applicabili a prototipo/migration locali, ma ogni grant/RPC deve essere dimostrato con DB effimero prima di mutazioni UI reali. Questo ADR non abilita Supabase cloud, Garmin reale, NAS, produzione, push, merge o deploy. Non introdurre VO₂max/VDOT/readiness, autenticazione nuova o modifiche Auth.
