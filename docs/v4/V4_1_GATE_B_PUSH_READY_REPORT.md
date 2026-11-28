# V4.1 SQL Gate B — report di preparazione trigger push

## Addendum — diagnosi run 46071087729

La run sul commit `3adeb9291cf4a1d016a4fbe67eeba1b84b5bac47` ha applicato la migration 0036 nel PostgreSQL effimero, dopo avere verificato l'identità del cluster. Il job ha riportato 4 test riusciti, 1 errore e 1 fallimento; il backup/restore è rimasto saltato perché il passo SQL precedente era fallito. Questa sessione non ha avviato nuove run.

### Diagnosi e correzioni

1. **Ciclo Planning inesistente.** `validate_session_period()` verifica il ciclo prima del controllo FK e solleva `InvalidParameterValue` (`22023`) se il ciclo non esiste. È una validazione contestuale intenzionale: produce un errore di dominio stabile per data/ciclo non validi. Il test ora si aspetta quell'errore, verifica nella catalogo PostgreSQL che la foreign key sessione→ciclo esista ancora e controlla che la sessione rifiutata non sia persistita. Sono aggiunti anche casi per una settimana abbinata correttamente e per la violazione della FK composita quando settimana e ciclo non corrispondono.
2. **Registro append-only.** Il trigger `BEFORE UPDATE OR DELETE FOR EACH ROW` protegge righe esistenti; un `DELETE` su tabella vuota ha `rowcount = 0` e non invoca il trigger, senza mutare lo stato. Questo è coerente con ADR 6: niente hard-delete di eventi nel CRUD e nessuna purge automatica. Il test crea un evento sintetico e verifica che UPDATE e DELETE sulla riga esistente e TRUNCATE siano rifiutati e che l'evento resti integro. Verifica separatamente il `DELETE` vuoto come no-op consentito. Non è stato aggiunto un trigger DELETE statement-level perché il contratto protegge gli eventi persistiti, non vieta istruzioni inerti.

**Migration 0036 invariata.** Le foreign key, i trigger esistenti e le ACL restano intatti; nessun privilegio è stato aggiunto. Le modifiche applicative sono limitate ai test SQL.

### Test e gate

| Verifica | Esito |
|---|---|
| `python -m py_compile tests/sql/v41_planning_contract.py tests/test_v41_sql_workflow.py` | PASS |
| `python tests/test_v41_sql_workflow.py` | PASS — 5/5 controlli statici workflow |
| `git diff --check` | PASS |
| Test SQL `PlanningSchema` e `PlanningRestore` | NON ESEGUITI localmente: Docker, PostgreSQL, client `psql`/`pg_dump`/`pg_restore` e Psycopg non disponibili |
| Backup/restore PostgreSQL | NON ESEGUITO localmente; nella run fallita precedente il passo restore era stato saltato |
| Actionlint / Gitleaks | NON ESEGUITI: strumenti non disponibili localmente |

Commit correttivo dei test: `595938788c8c2b24053a7d5080bf4ef1480f536f`. Il commit del presente aggiornamento documentale è riportato nell'handoff finale.

**Gate B resta APERTO.** I test SQL corretti non sono stati eseguiti su PostgreSQL live. La chiusura richiede una nuova run effettiva che superi migrazione fresh/upgrade, ACL/RLS, riferimenti e vincoli, rollback atomico e backup/restore comparativo. Non avviare RPC o UI persistente Planning/Goal Center prima di quel risultato.

Per il collaudo successivo, pubblicare solo dopo autorizzazione esplicita il commit correttivo sul branch V4: il trigger push filtrato eseguirà il workflow sui file del gate. Associare il risultato allo SHA esatto e verificare anche il riepilogo del restore; non considerare il Gate B superato se tale step non risulta `success`.

## Stato della consegna

- Worktree: `D:\Repository\garmin-coaching-hub-v4`
- Branch: `feature/v4-visual-foundation`
- Commit base verificato: `53f18ddb173af5472183d26127be5da20815ab01`
- Gate B: **APERTO**. Nessuna esecuzione PostgreSQL effettiva è stata fatta in questa sessione.
- SHA completo del commit locale contenente workflow, regressioni statiche e report: fornito nell'handoff finale dopo il commit; non è stato pubblicato.

## Modifiche al workflow

Il workflow `.github/workflows/v41-planning-sql-gate.yml` mantiene `workflow_dispatch` e aggiunge un trigger `push` circoscritto a `feature/v4-visual-foundation` e ai seguenti file del gate:

- `.github/workflows/v41-planning-sql-gate.yml`;
- `supabase/bootstrap.sql`;
- `supabase/dashboard.sql`;
- `supabase/migrations/0034_data_intelligence.sql`;
- `supabase/migrations/0035_staging_reliability.sql`;
- `supabase/migrations/0036_v41_planning.sql`;
- `tests/sql/auth_stub.sql`;
- `tests/sql/v41_planning_contract.py`;
- `tests/test_v41_sql_workflow.py`.

Oltre ai tre percorsi obbligatori, sono inclusi soltanto gli input effettivamente applicati dal job (bootstrap, dashboard, migrations 0034/0035 e auth stub) e il test statico invocato dal job. Una loro modifica può cambiare il database installato o i controlli del gate, perciò deve rieseguire il collaudo. Non sono configurati glob ampi, `main`, branch V3, pull request, `workflow_run` o schedule. La modifica dei soli documenti non attiva il job; una modifica a uno dei percorsi elencati sul branch indicato attiva il push trigger.

La concorrenza è dedicata al ref ed è impostata a `cancel-in-progress: false`, così una nuova esecuzione non interrompe una verifica in corso. Il checkout usa esplicitamente `${{ github.sha }}` con `persist-credentials: false`. Il workflow conserva permessi `contents: read`, runner effimero `ubuntu-24.04`, timeout, PostgreSQL `17.6`, binding `127.0.0.1`, Python `3.12.10`, driver Psycopg fissato e sole credenziali sintetiche.

Non sono presenti riferimenti a GitHub Secrets, Supabase cloud, Garmin, NAS, URL esterni, deploy o pubblicazione. Il job verifica il container PostgreSQL previsto e il system identifier del cluster; la libreria Python ripete il controllo dell'identità e rifiuta destinazioni non loopback o cluster non corrispondenti. I quattro database temporanei devono essere inizialmente assenti e vengono rimossi con uno step `if: always()`; lo smantellamento del service container è garantito dal runner effimero.

## Copertura del gate

Il job sceglie PostgreSQL effimero perché il contratto 0036 richiede migrazioni, ruoli, ACL, RLS, transazioni, `pg_dump` e `pg_restore`; non avvia Supabase Auth/PostgREST e non certifica tali servizi.

L'ordine del database è: auth stub sintetico, bootstrap, dashboard, migrazioni 0034 e 0035, quindi 0036. I test coprono fresh/upgrade, archivio sintetico preservato, ACL/RLS, ruoli, vincoli, revisioni, link, eventi e rollback atomico in database separato.

La verifica post-restore è stata rafforzata: confronta tra database upgrade sorgente e database ripristinato il set delle tabelle Planning, le definizioni e la validità dei vincoli, gli indici, i trigger e il conteggio delle righe per ciascuna tabella; confronta inoltre la riga sintetica dell'archivio. Nel database ripristinato verifica RLS forced, ACL e rifiuto effettivo di un inserimento che viola un vincolo.

Il riepilogo Actions riporta lo SHA evento e lo stato dei singoli gate. Errori e verifiche obbligatorie non vengono mascherati; il cleanup e il report hanno `always()` per lasciare evidenza anche su fallimento.

## Verifiche locali e limiti

| Controllo | Risultato |
|---|---|
| Regressioni statiche trigger e sicurezza workflow | PASS — 5/5 |
| `python -m py_compile` sui test Python | PASS |
| `git diff --check` | PASS |
| Parser YAML / YAML 1.1 | PyYAML non installato; nessun parser YAML 1.1 disponibile verificato |
| Actionlint | Non disponibile localmente |
| Gitleaks | Non disponibile localmente |
| PostgreSQL, migrazione, ACL/RLS, rollback, dump/restore | Non eseguiti: PostgreSQL, Docker e Psycopg non sono disponibili nell'ambiente locale |
| GitHub Actions | Nessun push e nessuna run remota, come richiesto |

Il file `V41_GATE_B_PUSH_AND_MONITOR.ps1` è stato soltanto letto e le sue condizioni di preflight sono state esaminate. Non è stato eseguito, nemmeno in preflight; la modalità `-Execute` resta non autorizzata.

Queste verifiche preparatorie non costituiscono il Gate B. La certificazione resta sospesa fino al completamento con successo degli step PostgreSQL effettivi su un runner effimero e sullo SHA desiderato.

## Procedura futura

1. Verificare branch, SHA, worktree pulito e autorizzazione prima della pubblicazione.
2. Una volta autorizzato, pubblicare il commit preparatorio sul solo branch V4: il push è limitato dai filtri descritti e avvia il Gate B solo quando contiene uno dei percorsi consentiti.
3. Individuare la run associata esattamente allo SHA pushato e controllare `workflow guard`, installazione driver, identità/creazione DB, migration/contratti e restore/cleanup.
4. Dichiarare Gate B superato soltanto se la run è `success`, il SHA corrisponde e tutti gli step obbligatori hanno esito positivo.

In alternativa, `workflow_dispatch` è utilizzabile solo dopo che GitHub ha registrato il workflow sul branch predefinito; non usarlo in questa sessione. Il trigger push non richiede quel prerequisito, ma la run inizierà soltanto dopo un push futuro autorizzato. Non effettuare retry di una run identica senza diagnosi.

## Operazioni non eseguite

Nessun push, merge, deploy, workflow manuale, run remota, collegamento Supabase cloud, accesso Garmin/NAS o modifica a `main` e ai worktree V3. Nessuna RPC o UI persistente Planning/Goal Center è stata iniziata.
