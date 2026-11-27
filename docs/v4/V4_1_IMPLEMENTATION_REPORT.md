# Garmin Coaching Hub V4.1 — report di implementazione incrementale

**Stato:** consegna parziale; Gate B bloccato in attesa di PostgreSQL effimero verificabile. Non dichiarare V4.1 completa.
**Worktree:** `D:\Repository\garmin-coaching-hub-v4`
**Branch:** `feature/v4-visual-foundation`

## Stato Git

- HEAD all'avvio: `10f39b19042fe7afd0e04bf252043f78fed1a580` (stato pulito).
- Il checkpoint A era già stato consolidato nel commit locale `a4e131edf39a5f7e20b5a1aeccd2727705c8f1bc` (`feat(v4.1): add goal math contracts`).
- Nessun push, merge, deploy, accesso cloud o modifica ai worktree V3 eseguiti.
- Commit di questa consegna: da riportare dopo la creazione del commit locale.

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
| B — migration additiva e test SQL | **PARTIAL — BLOCKED: SQL live** | Migration `0036_v41_planning.sql` e test sintetici preparati. Non eseguiti su PostgreSQL: `docker`, `supabase` e `psql` non sono disponibili; nessun servizio PostgreSQL locale e `127.0.0.1:5432` non accetta connessioni. La migration non è certificata. |
| C — RPC allowlist | **BLOCKED / NOT STARTED** | Il prompt vieta mutazioni UI/RPC prima della verifica live del Gate B. |
| D — UI persistente Planning e Goal Center | **BLOCKED / NOT STARTED** | Nessuna UI persistente aggiunta. Le anteprime V4 esistenti restano dimostrative/offline. |
| E — report operativo | **PARTIAL** | Questo report documenta deliverable, test e blocco. I gate live rimangono aperti. |

## Migration preparata — non certificata

`supabase/migrations/0036_v41_planning.sql` aggiunge lo schema privato `planning_private`, i cicli, le settimane annotate, le sessioni, i goal, le milestone, i link manuali e il log eventi. Non modifica bootstrap, dashboard, migrazioni 0034/0035, tabelle Garmin o grants del writer.

Protezioni implementate nel testo SQL:

- revoca dei privilegi sullo schema e sugli oggetti a `PUBLIC`, `anon` e `authenticated`; nessun grant al writer;
- RLS abilitata e forzata sulle sette tabelle, senza policy browser;
- FK restrictive per la storia Planning, indice univoco parziale sugli activity link attivi;
- controlli su metriche/unità/direzione goal, date, ISO week, timezone, range ciclo e link a ID attività esistenti;
- revision incrementata dal database e timestamp `updated_at` aggiornato;
- timezone del ciclo e del goal immutabile;
- log eventi non aggiornabile, non eliminabile e non troncabile.

Queste sono proprietà del DDL ispezionato, non prove di comportamento PostgreSQL. Restano da verificare in cluster effimero sintassi e applicazione transazionale, RLS/ACL effettive, errori attesi, restore e compatibilità con la versione Supabase di destinazione. Non esistono ancora RPC che scrivano il log eventi; non sono state introdotte mutazioni UI.

## Test SQL predisposti

`tests/sql/v41_planning_contract.py` verifica fresh/upgrade sintetici, ACL dirette, RLS forced, range/date e timezone, unità/goal, revisioni, FK, unicità link, immutabilità eventi e atomicità di rollback indotto. Il test richiede tre database vuoti, `gch_v41_planning_fresh`, `gch_v41_planning_upgrade` e `gch_v41_planning_atomic`, in un cluster usa-e-getta verificato; non crea, svuota o elimina database.

Non è incluso nell'autodiscovery della suite SQL V3: va invocato esplicitamente dopo aver predisposto i due database nell'ambiente effimero. Il test `upgrade` inserisce una sola attività Garmin sintetica prima di 0034/0035 e controlla che resti invariata dopo 0036.

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
'@ | psql -X -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1
$env:PYTHONPATH = 'tests/sql'
python -m unittest v41_planning_contract -v
```

I placeholder vanno sostituiti solo con parametri temporanei del cluster effimero. Non usare DSN, password, database o identificatori di produzione. Il test non deve essere eseguito finché l'identità del cluster non è stata verificata. Il test di restore con `pg_dump`/`pg_restore` rimane da aggiungere ed eseguire nell'ambiente effimero; gli eseguibili non sono disponibili qui. Dopo i test, eliminare i tre database solo tramite procedura esplicita dell'ambiente effimero e dopo avere verificato la destinazione; questa sessione non ne ha creati né eliminati.

## Verifiche eseguite in questa sessione

| Controllo | Esito |
|---|---|
| `npm run test:load` con Node 22.23.5 | PASS, 5/5 |
| `npm run test:analytics` con Node 22.23.5 | PASS, 27/27 (analytics, API dati, goal math) |
| `npm run build` | PASS, TypeScript + Vite |
| `python -m py_compile tests/sql/v41_planning_contract.py` | PASS |
| `git diff --check` | PASS |
| PostgreSQL / migration / ACL / RLS / rollback / backup-restore live | NON ESEGUITI: nessun cluster e nessun client disponibili |
| Python SQL contract test | NON ESEGUITO: oltre al database assente, `psycopg` non è installato nell'interprete disponibile |
| Playwright/Auth live | NON ESEGUITI: checkpoint C/D bloccati; non sono state introdotte UI/API live |

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

Predisporre un PostgreSQL **effimero** isolato e identificabile, con strumenti client Python `psycopg` e `psql`. Solo dopo la verifica dell'identificatore del cluster si può applicare la migration e lanciare i test preparati su database vuoti. Finché questi test non passano, non implementare le RPC del checkpoint C né la UI persistente del checkpoint D. Non usare Supabase cloud, produzione, Garmin reale o NAS per sbloccare questo gate.
