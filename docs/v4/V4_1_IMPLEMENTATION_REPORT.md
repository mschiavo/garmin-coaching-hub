# Garmin Coaching Hub V4.1 — report di implementazione incrementale

**Stato:** RPC Planning V1 implementate e test preparati; verifica PostgreSQL e Supabase Auth/PostgREST del nuovo commit ancora aperta. Non dichiarare RPC validate finché i gate effimeri non sono eseguiti con successo.
**Worktree:** `D:\Repository\garmin-coaching-hub-v4`
**Branch:** `feature/v4-visual-foundation`

## Stato Git

- Commit base per l'implementazione RPC: `0f5b7ac5b1f659473dafbafaf969e3288901a3d9`.
- Il checkpoint A era già stato consolidato nel commit locale `a4e131edf39a5f7e20b5a1aeccd2727705c8f1bc` (`feat(v4.1): add goal math contracts`).
- Migration/test B preparatori: commit locale `3b69c71a62d8e8c7702aa24b15a7b7a56f813a54` (`feat(v4.1): prepare planning schema checkpoint`).
- Il report operativo è aggiornato nel commit successivo a quello dello schema; HEAD finale è quello indicato nella consegna.
- Nessun push, merge, deploy, accesso cloud o modifica ai worktree V3 eseguiti.
- SHA del commit locale di questa consegna: riportato nel messaggio operativo finale.

## Decisioni attuate

Sono registrate in `V4_1_IMPLEMENTATION_DECISIONS.md` e riflesse nei contratti e nel modulo puro già presenti:

1. Ownership condivisa a livello installazione Community, con allowlist per ogni futura RPC.
2. Timezone IANA immutabile per ciclo.
3. Settimane ISO lunedì–domenica e date civili inclusive.
4. Sessioni senza ora nell'MVP.
5. Più attività per sessione, al massimo una sessione attiva per attività, collegamento manuale.
6. Revisioni monotone, cancellazione logica e log append-only senza purge automatica.
7. Goal limitati a distanza (m), durata (s), sessioni (intero non negativo) e tempo gara (s, lower-is-better).
8. Nessun auto-link persistente; link non più affidabili devono poter essere riconciliati senza mutare la sessione o l'archivio Garmin.

La matematica pura di Goal Center tratta separatamente dati manuali/verificati e coverage, rifiuta di dedurre lo zero da dati mancanti o non riconciliati e non assegna percentuali al tempo gara.

## Checkpoint

| Checkpoint | Stato | Evidenza / limite |
|---|---|---|
| A — contratti e funzioni pure | **DONE** | Modulo TypeScript, DTO/documenti coerenti e 12 test dedicati; test numerici e build superati. Commit `a4e131e`. |
| B — schema 0036 e test SQL effimeri | **PASS sul commit precedente** | Esito PostgreSQL Gate B run `46131042670`, riferito alla migration 0036. Non equivale alla validazione della nuova migration 0037. |
| C — RPC Planning V1 | **IMPLEMENTATE — E2E APERTO** | Migration 0037, test PostgreSQL e harness HTTP Auth/PostgREST effimero aggiunti in questa consegna. Docker/Supabase/PostgreSQL non sono disponibili localmente, quindi nessun test SQL o Auth/PostgREST è stato eseguito in questa sessione. |
| D — UI persistente Planning e Goal Center | **BLOCKED / NOT STARTED** | Nessuna UI persistente aggiunta. Le anteprime V4 esistenti restano dimostrative/offline. |
| E — report operativo | **PARTIAL** | Questo report documenta deliverable, test e blocco. I gate live rimangono aperti. |

## Migration Planning

`supabase/migrations/0036_v41_planning.sql` aggiunge lo schema privato e le entità Planning/Goals. L'utente ha comunicato il superamento del Gate B sulla migration 0036 (run `46131042670`). `supabase/migrations/0037_v41_planning_rpc.sql` aggiunge le RPC Planning V1 e la revisione globale dei cursori; non cambia 0036, le tabelle Garmin o i contratti RPC V3.4.1.

Protezioni implementate nel testo SQL:

- revoca dei privilegi sullo schema e sugli oggetti a `PUBLIC`, `anon` e `authenticated`; nessun grant al writer;
- RLS abilitata e forzata sulle sette tabelle, senza policy browser;
- FK restrictive per la storia Planning, indice univoco parziale sugli activity link attivi;
- controlli su metriche/unità/direzione goal, date, ISO week, timezone, range ciclo e link a ID attività esistenti;
- revision incrementata dal database e timestamp `updated_at` aggiornato;
- timezone del ciclo e del goal immutabile;
- log eventi non aggiornabile, non eliminabile e non troncabile.

Le RPC richiedono autenticazione e membership nella allowlist per ogni chiamata; usano `SECURITY DEFINER` con search path vuoto, revocano EXECUTE a PUBLIC/anon, restituiscono DTO senza accesso diretto allo schema privato, usano revisioni per entità e una revisione API serializzata per invalidare cursori. Le cancellazioni sono logiche e gli eventi registrano metadati senza note o payload. La compatibilità V3.4.1 è preservata perché le funzioni legacy/V2 non sono modificate.

Queste proprietà sono implementate nel codice SQL ma non sono ancora prove di comportamento sul motore: la migration 0037, le ACL effettive, le richieste JWT, il cambio account e il restore restano da eseguire nel gate effimero.

## Test SQL predisposti

`tests/sql/v41_planning_contract.py` verifica fresh/upgrade sintetici, ACL/RLS, vincoli e rollback, più le RPC con identità allowlisted/denied sintetiche, persistenza, cronologia, paginazione, stale revision e rifiuto accesso diretto. Il workflow effimero crea quattro database verificati e include il dump/restore.

Non è incluso nell'autodiscovery della suite SQL V3: viene invocato esplicitamente dal workflow V4.1. Il test `upgrade` inserisce una sola attività sintetica prima di 0034/0035 e controlla che resti invariata dopo le migration Planning.

Esecuzione prevista esclusivamente su PostgreSQL effimero locale/runner, con `V34_TEST_DSN` diretto su loopback e `GCH_TEST_POSTGRES_SYSTEM_ID` ottenuto dal cluster sintetico:

```powershell
Set-Location D:\Repository\garmin-coaching-hub-v4
$env:V34_TEST_DSN = 'host=127.0.0.1 dbname=postgres user=<utente-del-cluster-effimero>'
$env:GCH_TEST_POSTGRES_SYSTEM_ID = '<system_identifier-del-cluster-effimero>'
python -m pip install -r requirements.txt
@'
CREATE DATABASE gch_v41_planning_fresh;
CREATE DATABASE gch_v41_planning_upgrade;
CREATE DATABASE gch_v41_planning_atomic;
CREATE DATABASE gch_v41_planning_restore;
'@ | psql -X -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1
$env:PYTHONPATH = 'tests/sql'
python -m unittest v41_planning_contract.PlanningSchema v41_planning_contract.PlanningRPC -v
```

I placeholder vanno sostituiti solo con parametri temporanei del cluster effimero. Non usare DSN, password, database o identificatori di produzione. Il test non deve essere eseguito finché l'identità del cluster non è stata verificata. Il workflow effimero esegue `pg_dump`/`pg_restore` e confronta oggetti, vincoli e dati. Questa sessione non ha creato né eliminato database.

## Verifiche documentate nella consegna precedente

| Controllo | Esito |
|---|---|
| `npm run test:load` con Node 22.23.5 | PASS, 5/5 |
| `npm run test:analytics` con Node 22.23.5 | PASS, 27/27 (analytics, API dati, goal math) |
| `npm run build` | PASS, TypeScript + Vite |
| `python -m py_compile tests/sql/v41_planning_contract.py` | PASS |
| `git diff --check` | PASS |
| `npm audit --audit-level=moderate --offline` | PASS, 0 vulnerabilità nel lockfile locale |
| PostgreSQL / migration / ACL / RLS / rollback / backup-restore live | NON ESEGUITI: nessun cluster e nessun client disponibili |
| Python SQL contract test | NON ESEGUITO: oltre al database assente, `psycopg` non è installato nell'interprete disponibile |
| Playwright/Auth live | NON ESEGUITI: checkpoint C/D bloccati; non sono state introdotte UI/API live |
| Gitleaks / actionlint | NON ESEGUITI: eseguibili non presenti nel PATH |

I primi test Node sono stati tentati con il Node di sistema 20.10.0 e non sono partiti perché il progetto richiede Node >=22 e importa TypeScript direttamente. Sono stati rilanciati e superati con Node 22.23.5 da npm cache, senza modificare manifest o lockfile.

## Preview locale esistente

La preview sintetica non dipende da servizi remoti:

```powershell
Set-Location D:\Repository\garmin-coaching-hub-v4\dashboard
npm exec --offline --yes --package=node@22 -- vite --host 127.0.0.1
```

Aprire `http://127.0.0.1:5173/tests/v4-dashboard-preview.html`. Navigare tra Home, Goal Center, Progresso settimanale e Performance Lab. Tutti i contenuti sono demo; non rappresentano dati persistiti e non verificano API/Auth. La schermata Planning esistente resta un'anteprima non persistente.

## Inventario filesystem ereditato (non ripetuto)

Secondo l'audit già completato nel commit `10f39b1`:

- esistono i worktree beta V3, DEV V3.4.1 e V4; questa sessione ha operato solo nel worktree V4;
- `INSTALL-V315.txt` e `garmin_v32_one_shot.py` non tracciati nel worktree beta: conservare;
- `.cache` (circa 4,04 GiB) e `.venv` (circa 57,2 MiB) nel worktree DEV V3.4.1: non ispezionati né toccati;
- artefatti V4 rigenerabili stimati circa 154,8 MiB (`node_modules`, `dist`, cache Python, `tsconfig.tsbuildinfo`): conservare in questo mandato;
- screenshot Playwright circa 14,1 MB: conservare come evidenza;
- backup V3, ZIP storici, migrazioni, report, `.env.local` e credenziali: non toccare;
- `react-is` è peer dependency di Recharts e non è stata rimossa.

Nessun file esistente è stato cancellato, spostato o ripulito. Nessun contenuto di `.env.local` è stato letto.

## Prossimo passo necessario e gate release

Il Gate B della sola migration 0036 è stato superato secondo l'esito fornito dall'utente (run `46131042670`). La migration 0037 e i nuovi test del checkpoint C devono ora essere eseguiti dal workflow `.github/workflows/v41-planning-sql-gate.yml`; la prova Auth, PostgREST e cambio account va eseguita separatamente tramite `.github/workflows/v41-planning-rpc-e2e.yml`. Fino al successo di entrambe le run, le RPC non sono validate e la UI persistente resta fuori ambito. Non usare Supabase cloud, produzione, Garmin reale o NAS.

## Consegna RPC Planning V1

Base verificata all'inizio: `0f5b7ac5b1f659473dafbafaf969e3288901a3d9`, branch `feature/v4-visual-foundation`, worktree V4 pulito. La nuova migration `0037_v41_planning_rpc.sql` implementa list/get/create/update/cancel cycle e list/get/create/update/reschedule/status-session. La cancellazione della seduta è soft (`status='cancelled'`); il ciclo mantiene sessioni e cronologia. L'RPC di completamento accetta solo origine manuale e non scrive né verifica dati Garmin.

Test SQL aggiunti per ACL, accesso anonimo, subject assente, utente autenticato escluso dall'allowlist, cambio identità e ripristino dell'accesso, CRUD con persistenza, log eventi, revisioni stale `40001`, cursori limitati/invalidati, input e atomicità della migration 0037. Il workflow PostgreSQL aggiorna dump/restore per includere `api_state`. Il nuovo harness `tools/local_supabase_planning_e2e.py` usa due account Auth sintetici, verifica che l'utente escluso mantenga una sessione valida ma venga rifiutato dalla RPC, esegue CRUD e conflitto tramite HTTP, cambia account e verifica la persistenza dopo il nuovo login.

Il test HTTP del conflitto si aspetta il codice PostgreSQL `40001` e lo status HTTP `500`: PostgREST 16 mappa la classe SQLSTATE `40` (“transaction rollback”) a 500. La regressione verifica il contratto SQLSTATE nel body, senza riclassificare l'errore come 400 né cambiare la semantica della RPC. [Riferimento PostgREST 16](https://docs.postgrest.org/en/v16/references/errors.html#http-status-codes).

### Diagnosi del container `unexpected_image` (run 46136970981)

La run 46136970981 ha avviato correttamente Supabase CLI 3.4.0 e poi è fallita nel controllo immagine. Il log registrava soltanto `category=unexpected_image`: il precedente step non stampava `.Config.Image` e il cleanup `if: always()` ha rimosso lo stack effimero. Di conseguenza **il riferimento specifico osservato in quella run non è ricostruibile dai log disponibili**; non viene attribuito arbitrariamente a un servizio.

La verifica della sorgente ufficiale fissata `supabase/cli` tag `v3.4.0` mostra invece il set deterministico di candidati che il resolver può scegliere. Il manifest [Dockerfile della CLI v3.4.0](https://github.com/supabase/cli/blob/v3.4.0/apps/cli/src/shared/services/Dockerfile) fissa PostgreSQL `17.12.0.002`, GoTrue `v2.198.0`, PostgREST `v16.6` e Kong `2.8.1`. Il [resolver immagini](https://github.com/supabase/cli/blob/v3.4.0/apps/cli/src/command-internal/docker-registry.ts) prova il mirror Public ECR, il mirror GHCR e infine il riferimento sorgente; [image-prepull](https://github.com/supabase/cli/blob/v3.4.0/apps/cli/src/command-internal/db-bootstrap/image-prepull.ts) restituisce il riferimento candidato scelto, poi passato alla creazione dei container. L'allowlist accetta ora esclusivamente questi riferimenti con tag esatto: ECR/GHCR e il rispettivo riferimento sorgente per ciascuno dei quattro servizi. Non accetta tag alternativi, `latest` o nomi non presenti nel manifest/resolver.

Il controllo ora legge soltanto `.Config.Image`; il logger valida separatamente sintassi di registry, repository e tag e stampa esclusivamente `registry`, `repository` e `version`. Se il valore è malformato, registra solo `image_ref=redacted`. Un riferimento sintatticamente valido ma non incluso nel set versionato viene registrato come osservazione sicura e causa ancora il fallimento `unexpected_image`. Rimangono invariati il conteggio di quattro container, stato `running`, rete Docker dedicata, binding loopback, identificazione del cluster PostgreSQL e cleanup.

Test statici aggiornati per enumerare esattamente i riferimenti autorizzati e verificare che la diagnostica preceda il confronto, separi i campi e non emetta il riferimento grezzo o `.Config.Env`. La run precedente non consente di dimostrare quale candidato specifico fosse stato selezionato. Non è stata avviata una nuova run remota; l'esatta immagine effettiva e il gate E2E restano da verificare in una successiva esecuzione autorizzata.

Il workflow effimero `.github/workflows/v41-planning-rpc-e2e.yml` non usa GitHub secrets, servizi cloud, Garmin, NAS o produzione; il target del harness è limitato a `127.0.0.1`, porta API 54331, PostgreSQL 54332, database `postgres` e cluster identifier catturato dal solo container PostgreSQL identificato. Le quattro immagini sono confrontate con riferimenti esatti. Checkout non conserva credenziali e cleanup usa `if: always()`.

### Verifiche della consegna corrente

| Verifica | Esito |
|---|---|
| Repository, branch e base SHA | PASS, corrispondono al worktree V4 richiesto |
| Test Python SQL/ACL/PostgreSQL effettivi | NON ESEGUITI: `psycopg`, PostgreSQL client/server e Docker non disponibili localmente |
| Test HTTP Auth/PostgREST | PREPARATI nel workflow, NON ESEGUITI; nessuna run remota avviata |
| Build/test dashboard | Non eseguiti: nessuna modifica frontend |
| Actionlint | NON ESEGUITO: eseguibile non disponibile; entrambi i workflow sono stati analizzati con parser YAML 2.9.1 |
| Python compile | PASS, harness SQL, harness locale e test statici compilati |
| Test statici workflow/SQL/RPC | PASS, 11/11 |
| `git diff --check` | PASS |
| Gitleaks | NON ESEGUITO: eseguibile non disponibile |

Non si dichiara validata la sintassi/semantica PostgreSQL 0037 né l'integrazione Supabase finché i due workflow non completano con successo sul commit risultante. Nessun push, merge, deploy o accesso a servizi reali è avvenuto.
