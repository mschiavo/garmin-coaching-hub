# V4.1 — Proposta di modello dati Planning & Goals

**Stato:** proposta non approvata. Nessuna migration implementata. Pseudo-DDL sotto indicativo, non eseguibile.

## Principi

Archivio Garmin immutato e writer-owned; Planning/Goals separati; date civili con zona IANA esplicita; audit timestamp `timestamptz`; progressi derivati; revisioni optimistic; cancellazioni logiche; missing non diventa zero.

## Entità

**`plan_cycles`:** UUID, nome, date locali inizio/fine, timezone IANA, stato `draft/active/completed/cancelled/archived`, revision bigint, created/updated timestamp, eventuale riferimento al ciclo sostituito.

**`plan_weeks`:** UUID, cycle UUID, `week_start date`, ordinal, titolo/nota e target settimanali opzionali tipizzati, revision. Unicità `(cycle_id,week_start)`. Raccomandazione: materializzare solo settimane con annotazioni/target; altre derivate dal range.

**`planned_sessions`:** UUID, cycle/week nullable, data locale, ora locale opzionale, sport, tipo seduta da catalogo, titolo/descrizione, note, ordinal, target distanza metri/durata secondi, intensità opzionale ma definita da tipo/unità, stato `planned/completed/skipped/cancelled`, revision, timestamps, eventuale `superseded_by`. Ammettere sessioni senza ciclo; target positivi quando presenti; riposo senza target. Ora non obbligatoria nell'MVP.

**`training_goals`:** UUID, scope week/month/block/race, metrica catalogata (distanza, durata, sedute, giorni attivi, tempo gara), target numerico tipizzato e unità canonica, direzione (`at_least/at_most/exact` o semantica gara), date locali, zona, ciclo opzionale, stato, provenienza, revision. Gara include evento/data/tempo, no percentuale generica.

**`goal_milestones`:** UUID, goal, data/ordinal, target/unit coerenti. Non materializzare progresso/readiness: derivare e versionare formula. JSON `numeric` come stringa decimale canonica evita rounding JavaScript.

**`session_activity_links`:** session UUID + `activity_id bigint`, linked_at, origine manuale, stato verifica, revision. Non modifica raw Garmin. Raccomandazione: link manuale, coppia univoca; una sessione può collegare più attività; attività multi-sessione solo su conferma deliberata. Alternativa più semplice: una attività al massimo una sessione. Nessun match automatico per sola data.

**History:** `plan_change_events` append-only minimo (entity, revision old/new, tipo created/edited/rescheduled/cancelled/linked/unlinked, timestamp, actor se deciso). Alternativa snapshot revisionato: sceglierne una e retention prima della migration; non duplicare note sensibili/raw.

## Relazioni e vincoli

```text
plan_cycles 1 ── 0..N plan_weeks 1 ── 0..N planned_sessions
     │                                  │
     └── 0..N training_goals             └── N..M session_activity_links ── garmin_activities
                         └── 0..N goal_milestones
```

Start ≤ end; session/week devono riferirsi allo stesso ciclo e rispettarne date; FK restrictive per preservare storia. Attività fuori piano restano fuori piano. Cicli sullo stesso scope non sovrapposti salvo decisione; goal possono sovrapporsi ma aggregati deduplicano per activity ID. Activity rimossa/data cambiata ⇒ link “da verificare”, sessione intatta. Completed senza link solo se semantica manuale approvata. Update con expected revision, mismatch = conflitto senza partial update.

Transizioni: draft→active; reschedule tracciato senza creare/cancellare attività; `cancelled` distinto da `skipped`; future escluse dall'aderenza. Non auto-generare sessioni da Garmin.

## Pseudo-DDL concettuale — NON ESEGUIBILE/NON APPROVATO

Nomi/tipi indicativi; schema, owner, RLS, grants, enum e FK cross-schema da approvare.

```text
plan_cycles(id uuid, name text, start_date date, end_date date, timezone text, status text, revision bigint, created_at timestamptz, updated_at timestamptz)
plan_weeks(id uuid, cycle_id uuid, week_start date, ordinal int, revision bigint)
planned_sessions(id uuid, cycle_id uuid null, week_id uuid null, session_date date, local_time time null, sport text, session_type text, title text, target_distance_m numeric null, target_duration_s numeric null, intensity_kind text null, intensity_target numeric null, notes text null, ordinal int, status text, revision bigint, superseded_by uuid null, created_at timestamptz, updated_at timestamptz)
training_goals(id uuid, cycle_id uuid null, scope text, metric text, target numeric, unit text, direction text, start_date date, end_date date, timezone text, status text, revision bigint)
goal_milestones(id uuid, goal_id uuid, due_date date, target numeric, unit text, ordinal int)
session_activity_links(session_id uuid, activity_id bigint, link_source text, verification_state text, revision bigint, linked_at timestamptz)
plan_change_events(id uuid, entity_kind text, entity_id uuid, revision bigint, event_kind text, occurred_at timestamptz, actor_id uuid null)
```

## Coerenza con l'esistente

Attività/daily/coverage restano writer-owned; nessun grant Planning al writer. FK verso `coaching` privata richiede valutazione privilegi senza grants frontend. Revision V3 globale non sostituisce revision per risorsa. Nessuna modifica retroattiva 0034/0035; futura migration dopo 0035, additive, testata fresh/upgrade/rollback/restore sintetico.
