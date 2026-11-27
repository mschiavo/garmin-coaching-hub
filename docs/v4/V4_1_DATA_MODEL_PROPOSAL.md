# V4.1 — Proposta di modello dati Planning & Goals

**Stato:** proposta non approvata. Nessuna migration implementata. Pseudo-DDL sotto indicativo, non eseguibile.

## Principi

Archivio Garmin immutato e writer-owned; Planning/Goals separati; date civili con zona IANA esplicita; audit timestamp `timestamptz`; progressi derivati; revisioni optimistic; cancellazioni logiche; missing non diventa zero.

## Entità

**`plan_cycles`:** UUID, nome, date locali inizio/fine, timezone IANA, stato `draft/active/completed/cancelled/archived`, revision bigint, created/updated timestamp, eventuale riferimento al ciclo sostituito.

**`plan_weeks`:** UUID, cycle UUID, `week_start date`, ordinal, titolo/nota e target settimanali opzionali tipizzati, revision. Unicità `(cycle_id,week_start)`. Raccomandazione: materializzare solo settimane con annotazioni/target; altre derivate dal range.

**`planned_sessions`:** UUID, cycle/week nullable, sola data civile, sport, tipo seduta da catalogo, titolo/descrizione, note, ordinal, target distanza metri/durata secondi, intensità opzionale ma definita da tipo/unità, stato `planned/completed/skipped/cancelled`, modalità completamento `manual/verified` separata dallo stato, revision, timestamps, eventuale `superseded_by`. Ammettere sessioni senza ciclo; target positivi quando presenti; riposo senza target. Nessuna ora locale nell'MVP.

**`training_goals`:** UUID, scope week/month/block/race, metrica MVP `distance` (m), `duration` (s), `sessions` (intero non negativo) o `race_time` (s), target numerico tipizzato e unità canonica, direzione `at_least` per i primi tre e lower-is-better per gara, date locali, zona immutabile copiata dal ciclo o configurazione alla creazione, ciclo opzionale, stato, provenienza, revision. Target distance/duration/race_time positivi; sessions può valere zero ma non produce percentuale. Gara include evento/data/tempo, no percentuale generica. Costanza, giorni attivi, recovery/readiness non sono nel contratto persistente MVP.

**`goal_milestones`:** UUID, goal, data/ordinal, target/unit coerenti. Non materializzare progresso/readiness: derivare e versionare formula. JSON `numeric` come stringa decimale canonica evita rounding JavaScript.

**`session_activity_links`:** session UUID + `activity_id bigint`, linked_at, `unlinked_at` nullable, origine manuale, stato `verified/needs_review/unresolved`, revision. Unique sull'attività fra link attivi (unlinked_at null); una sessione può collegare più attività. Non modifica raw Garmin. Nessun matching automatico persistito o conferma basata solo sulla data.

**History:** `plan_change_events` append-only minimo (entity, revision old/new, tipo created/edited/rescheduled/cancelled/linked/unlinked, timestamp, actor se deciso). Alternativa snapshot revisionato: sceglierne una e retention prima della migration; non duplicare note sensibili/raw.

## Relazioni e vincoli

```text
plan_cycles 1 ── 0..N plan_weeks 1 ── 0..N planned_sessions
     │                                  │
     └── 0..N training_goals             └── N..M session_activity_links ── garmin_activities
                         └── 0..N goal_milestones
```

Start ≤ end; session/week devono riferirsi allo stesso ciclo e rispettarne date; FK restrictive per preservare storia. Attività fuori piano restano fuori piano. Cicli sullo stesso scope non sovrapposti salvo decisione; goal possono sovrapporsi ma aggregati deduplicano per activity ID. Activity rimossa/data cambiata ⇒ link “da verificare”, sessione intatta. Completed senza link solo se semantica manuale approvata. Update con expected revision, mismatch = conflitto senza partial update.

Transizioni: draft→active; reschedule tracciato senza creare/cancellare attività; `cancelled` distinto da `skipped`; future escluse dall'aderenza. Sessione completata manualmente è distinta da completamento verificato via link e non contribuisce automaticamente a metri/secondi Garmin. Nessun auto-generare sessioni da Garmin.

## Pseudo-DDL concettuale — NON ESEGUIBILE/NON APPROVATO

Nomi/tipi indicativi; schema, owner, RLS, grants, enum e FK cross-schema da approvare.

```text
plan_cycles(id uuid, name text, start_date date, end_date date, timezone text, status text, revision bigint, created_at timestamptz, updated_at timestamptz)
plan_weeks(id uuid, cycle_id uuid, week_start date, ordinal int, revision bigint)
planned_sessions(id uuid, cycle_id uuid null, week_id uuid null, session_date date, sport text, session_type text, title text, target_distance_m numeric null, target_duration_s numeric null, intensity_kind text null, intensity_target numeric null, notes text null, ordinal int, status text, completion_kind text null, revision bigint, superseded_by uuid null, created_at timestamptz, updated_at timestamptz)
training_goals(id uuid, cycle_id uuid null, scope text, metric text, target numeric, unit text, direction text, start_date date, end_date date, timezone text, status text, revision bigint)
goal_milestones(id uuid, goal_id uuid, due_date date, target numeric, unit text, ordinal int)
session_activity_links(session_id uuid, activity_id bigint, link_source text, verification_state text, linked_at timestamptz, unlinked_at timestamptz null)
plan_change_events(id uuid, entity_kind text, entity_id uuid, revision bigint, event_kind text, occurred_at timestamptz, actor_id uuid null)
```

`session_activity_links` richiede un indice univoco parziale sull'`activity_id` dove `unlinked_at IS NULL`; questo dettaglio va realizzato e testato nella migration, non è implicato dal frammento schematico sopra.

## Coerenza con l'esistente

Attività/daily/coverage restano writer-owned; nessun grant Planning al writer. FK verso `coaching` privata richiede valutazione privilegi senza grants frontend. Revision V3 globale non sostituisce revision per risorsa. Nessuna modifica retroattiva 0034/0035; futura migration dopo 0035, additive, testata fresh/upgrade/rollback/restore sintetico.
