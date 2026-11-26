# Consolidamento repository Garmin Coaching Hub

**Data aggiornamento:** 26 novembre 2026
**Worktree:** `D:\Repository\garmin-coaching-hub-dev`
**Branch di lavoro:** `feature/v341-staging-reliability`

## Esito sintetico

Il commit autorizzato `44dde7d3a0a5830202d2b23bd0dfc154cb54a864` è stato pubblicato sul branch `feature/v341-staging-reliability` in fast-forward dal precedente `15f69db4d76ea59aa96df68bfeab40152a851644`. La CI `45784585354` sullo SHA esatto è completata con successo per Dashboard, Python e PostgreSQL.

Le copie dei quattro artefatti storici sono state verificate, leggibili e corrispondenti ai sorgenti per dimensione e SHA-256 prima della pulizia. I worktree locali V3.2 e V3.3 e soltanto i relativi output ignorati inventariati sono stati rimossi, separatamente, tramite `Remove-V341LegacyWorktree.ps1`; branch e riferimenti remoti sono rimasti.

Il worktree beta e quello di sviluppo sono gli unici rimasti. Non sono stati usati Docker sul PC, NAS, Supabase cloud o Garmin reale; non sono state eseguite migrazioni di produzione, merge o deploy. In questo host non sono disponibili PostgreSQL e i relativi client, quindi SQL e restore non sono stati ripetuti localmente. Il job PostgreSQL CI sulla release esatta è verde.

Il report è stato aggiornato dopo le operazioni. L'eventuale commit di questo aggiornamento è locale e non pubblicato.

## Riferimenti Git e CI

È stato eseguito `git fetch --prune origin`; non sono stati modificati branch locali. Tutti i riferimenti richiesti coincidono con i rispettivi riferimenti remoti:

| Riferimento | SHA locale e remoto |
| --- | --- |
| `main` | `58df16989f8d781672dc6b5278efb91a7187bed4` |
| `feature/community-v3-beta` | `3a363ab29cba4e97fa46dc39dbf1405af856252a` |
| `feature/v32-recharts-migration` | `ba30c08b7ecd8836b7a3492a6f183fa7c93ac52c` |
| `feature/v33-advanced-running-analytics` | `f117f98073a4544b4099c5483ef0514ec3132d72` |
| `feature/v34-data-intelligence` | `5b1700b892a6f6b3b29e22326978d42f0504982d` |
| `feature/v341-staging-reliability` | `44dde7d3a0a5830202d2b23bd0dfc154cb54a864` |

Il tag `v3.1.5-beta.1` punta al commit `3a363ab29cba4e97fa46dc39dbf1405af856252a`; il tag e i ref storici non sono stati alterati.

Il commit `44dde7d` ha parent `15f69db`. Il push è stato eseguito senza force e il ref remoto è stato riletto. La run GitHub Actions [45784585354](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45784585354) è `completed / success` sullo SHA esatto `44dde7d3a0a5830202d2b23bd0dfc154cb54a864`: [Python](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45784585354/job/139788028612), [Dashboard](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45784585354/job/139788029030) e [PostgreSQL](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45784585354/job/139788029062) sono tutti `completed / success`.

Prima del push, HEAD, parent, branch, pulizia del worktree e Gitleaks erano stati verificati. `main`, Community Beta, V3.2, V3.3 e V3.4 coincidevano con gli SHA locali/remoti attesi; dopo l'operazione la sola ref remota aggiornata è V3.4.1. Nessun altro branch, tag o ref storico è stato modificato.

## Inventario worktree e processi

| Cartella | Branch / HEAD | Stato e decisione |
| --- | --- | --- |
| `D:\Repository\garmin-coaching-hub` | beta / `3a363ab` | È il worktree beta permanente da conservare. Ci sono due file non tracciati e output ignorati locali; non li ho aperti o modificati. È stato rilevato `agy.exe` con un percorso esplicito in questa cartella: non terminato. È presente anche `dashboard/.env.local`, non letto, copiato o incluso nel report. |
| `D:\Repository\garmin-coaching-hub-dev` | V3.4.1 / `44dde7d` | Worktree permanente, branch remoto allineato al commit pubblicato prima dell'aggiornamento locale di questo report. |
| `D:\Repository\garmin-coaching-hub-v32` | V3.2 / `ba30c08` | Worktree rimosso dopo preflight positivo, verifica delle evidenze, cancellazione selettiva dei soli output ignorati inventariati e controllo finale dello script. Branch locale e remoto conservati. |
| `D:\Repository\garmin-coaching-hub-v33` | V3.3 / `f117f98` | Worktree rimosso con la stessa procedura, separatamente da V3.2. Branch locale e remoto conservati. |

Prima della rimozione è stato controllato l'elenco di 381 processi: nessun command line, percorso eseguibile o working directory rilevato puntava ai worktree V3.2/V3.3. Sono stati verificati 30 processi interattivi/server (terminali, IDE e Node/Python/PostgreSQL); i relativi working directory erano leggibili e fuori dai due target. I titoli delle finestre IDE/terminali non indicavano V3.2/V3.3. Il processo `agy.exe` e la finestra VS Code riferiti alla beta sono rimasti intatti. Il controllo del working directory non equivale a un'ispezione dei buffer/file non salvati di IDE chiusi: la rimozione era limitata ai soli due worktree autorizzati e ai file ignorati noti.

### Artefatti beta da preservare

Il worktree beta contiene due file non tracciati (`INSTALL-V315.txt`, 333 byte; SHA-256 `69482501C3AFC0AD3F1F3A90D4220E1D9867D937A643116584CD60F34DE69D15`; `garmin_v32_one_shot.py`, 24.418 byte; SHA-256 `32EDD73226C9E6DB854CE904E73E4FD68ED6C9A1C3D59459716BF7E8EAD270A3`). I contenuti non sono stati letti; restano sul posto per la revisione del proprietario.

Sono inoltre presenti sei archivi ZIP ignorati, non estratti né copiati: `garmin-v3-1-1-chart-usability-fix.zip` (3.516 byte), `garmin-v3-1-2-cartesian-all-charts.zip` (6.127), `garmin-v3-1-3-cartesian-axes-fixed.zip` (3.815), `garmin-v3-1-3-cartesian-axes.zip` (8.155), `garmin-v3-1-4-interactive-charts.zip` (2.800), `garmin-v3-1-5-community-beta.zip` (6.672). Restano nella cartella originale. Gli altri ignorati includono `dashboard/dist`, `dashboard/node_modules`, `dashboard/tsconfig.tsbuildinfo`, cache Python e due backup CSS/TSX pre-V3.1.2; non sono stati modificati.

### Evidenze V3.2/V3.3 conservate

Il dry-run e il preflight di rimozione hanno confermato per entrambi HEAD e branch previsti, SHA remoto corrispondente, zero modifiche/untracked, nessun ignored non classificato e nessun processo/sessione riferibile ai target per i controlli descritti sopra. Gli unici output ignorati erano `__pycache__`, `tests/__pycache__`, `dashboard/node_modules`, `dashboard/dist`, `dashboard/tsconfig.tsbuildinfo` e `dashboard/test-results`.

`dashboard/test-results` V3.2 conteneva solo `.last-run.json` con stato `passed` e nessun test fallito. V3.3 conteneva lo stesso metadato e due report sintetici, desktop e mobile, relativi al test analytics. Prima della rimozione ho ricontrollato che tutte e quattro le copie fossero leggibili, avessero dimensione e SHA-256 dichiarati nel [manifesto locale](D:/Repository/garmin-release-evidence/consolidation-2026-11-24/manifest.json) e coincidessero ancora con i sorgenti. I report desktop/mobile hanno lo stesso hash perché i contenuti sono identici. I sorgenti non esistono più dopo la rimozione autorizzata; le copie e il manifesto esterno restano disponibili. Nessun `.env`, database, `node_modules`, `dist` o cache è stato copiato.

## Verifiche offline

| Controllo | Esito |
| --- | --- |
| Python: `python -m unittest discover -s tests -v` | 18 test superati; eseguiti con Python 3.14.7 disponibile localmente. |
| Compilazione Python (`py_compile` su script applicativi e staging) | Superata. |
| Dashboard: build Vite/TypeScript | Superata; bundle maggiore 393,56 kB. |
| Dashboard: Training Load | 5 test superati. |
| Dashboard: Analytics e API | 15 test superati. |
| Dashboard: Playwright desktop/mobile | 16 test superati, con dati sintetici. |
| `npm audit --audit-level=moderate` | 0 vulnerabilità. |
| Gitleaks 8.30.1 su tutti i ref prima del push (35 commit) | 0 segreti rilevati su circa 788 kB. |
| PostgreSQL locale 17 / restore isolato | Non eseguito: non sono disponibili `psql`, `initdb`, `pg_ctl`, `pg_dump`, `pg_restore`, Docker o servizio PostgreSQL. Nessun database remoto è stato usato come sostituto. |

Node 22.23.5, fissato dal progetto alla major 22, è stato scaricato in `.cache` come runtime portatile; SHA-256 verificato contro il manifesto ufficiale Node.js. Gitleaks 8.30.1 è stato scaricato in `.cache` e verificato col file checksum ufficiale della release. Non sono state installate applicazioni o servizi di sistema. Il primo tentativo con il Node globale 20.10.0 aveva superato la build ma non poteva caricare i moduli TypeScript dei test; la suite è stata poi rieseguita e superata con Node 22.23.5.

La CI sul commit esatto ha eseguito i test SQL su PostgreSQL 17 containerizzato e il relativo job è verde. I 71 test V3.4.1 del report operativo precedente corrispondono ai 54 test Python/dashboard già verificati localmente e ai 17 test SQL della CI. In questa sessione non è stata eseguita alcuna query SQL o prova backup/restore locale.

## Percorso Git e passaggio a un'unica applicazione ufficiale

Modello proposto:

- `main` resta il ramo stabile della produzione.
- `feature/*` contiene branch temporanei di lavoro. `garmin-coaching-hub-dev` è la cartella/worktree di sviluppo, non un branch `dev` obbligatorio.
- Il worktree beta resta disponibile finché il tester lo usa. I worktree V3.2/V3.3 sono stati rimossi, mentre branch e tag V3.2/V3.3/V3.4 restano per riproducibilità e confronto.
- Dopo le verifiche di staging e l'approvazione separata, preparare una PR da `feature/v341-staging-reliability` a `main`. Nessuna PR o merge è stata aperta in questo incarico.

### Checklist PR/promozione V3.4.1 → `main`

1. **Contratto V2/V3 e trigger:** rivedere le differenze tra dashboard V2 e V3.x, configurazione Pages/base path, chiavi publishable, endpoint RPC e permessi. Il workflow Pages è `workflow_dispatch` e ha una condizione di fork per la beta; sync e import Garmin scrivono sul database configurato e il sync è pianificato sul branch predefinito. Ispezionare tutti i workflow e i secrets/vars del repository prima di una futura PR o attivazione.
2. **Database additivo:** revisionare l'ordine `bootstrap.sql`, `dashboard.sql`, migrazioni `0034_data_intelligence.sql` e `0035_staging_reliability.sql`. Verificare dipendenze, ruoli/ACL, allowlist, marker, RPC legacy/V2 e cache PostgREST su un ambiente di staging autorizzato. Non applicare migrazioni al database di produzione in questa sessione.
3. **Prova e backup:** ottenere un backup prima della prova, revisionare la TOC ed eseguire un ripristino isolato. Confrontare conteggi, date, hash RPC, ownership e ACL. Le verifiche PostgreSQL CI e locali precedenti non equivalgono a una prova Auth/PostgREST gestita.
4. **Collaudo staging:** usare due account sintetici, uno autorizzato e uno negato; verificare Auth, RPC, REST, login/logout, export locale, paginazione, revisioni e viewport mobile/desktop. Registrare solo esiti minimizzati, senza token o payload personali.
5. **Writer e rilascio:** fermare i writer per le operazioni DB approvate; rilasciare applicazione e writer in ordine coordinato; controllare log, errori Auth/RPC e consistenza dopo l'avvio. Verificare i workflow pianificati e manuali per evitare attivazioni sul target sbagliato.
6. **Rollback/go-no-go:** definire criteri espliciti per stop (login, ACL, RPC, conteggi o errori writer), rollback applicativo al bundle/writer precedente e restore del backup solo su target isolato secondo procedura approvata. Procedere a produzione solo dopo gate staging, approvazione delle migrazioni e approvazione distinta di PR/merge/deploy.

Il database Supabase attuale resta l'unico database di produzione. Il NAS è escluso. Supabase Auth/PostgREST gestiti e l'eventuale prova Garmin con dati autorizzati restano gate esterni; non sono stati simulati né dichiarati superati.

### Proposta futura per V3.5

Solo dopo la promozione e la stabilizzazione V3.4.1: aprire un branch `feature/v35-*` dal `main` aggiornato, definire prima obiettivi e contratti API/schema, implementare su fixture sintetiche e migrazioni additive, mantenere CI/test e staging come gate, quindi PR separata. Nessun file o codice V3.5 è stato creato.

## Pulizia V3.2/V3.3 completata

L'utente ha autorizzato esplicitamente la rimozione. Dopo la verifica del manifesto e il controllo dei processi/sessioni, sono stati eliminati solo questi output ignorati, che coincidevano con l'inventario: `__pycache__`, `tests/__pycache__`, `dashboard/node_modules`, `dashboard/dist`, `dashboard/tsconfig.tsbuildinfo`, `dashboard/test-results`. I report di test erano già conservati fuori dai worktree con SHA verificati.

È stato eseguito separatamente per ogni target:

```powershell
pwsh -NoProfile -File tools/Remove-V341LegacyWorktree.ps1 -Remove -Target V32 -ConfirmClosed
pwsh -NoProfile -File tools/Remove-V341LegacyWorktree.ps1 -Remove -Target V33 -ConfirmClosed
```

Entrambe le invocazioni sono terminate senza force. L'inventario finale Git contiene soltanto `D:\Repository\garmin-coaching-hub` (Community Beta) e `D:\Repository\garmin-coaching-hub-dev` (V3.4.1). Nessun branch locale/remoto, tag o riferimento storico è stato cancellato.

## Percorso Auth/PostgREST senza progetto cloud aggiuntivo

### Stato eseguito

In questa macchina non esistono `psql`, `initdb`, `pg_ctl`, `pg_dump`, `pg_restore`, Docker, Supabase CLI o un servizio PostgreSQL. Non sono quindi state eseguite prove SQL locali, installazioni, backup o restore. Il solo test SQL realmente eseguito in questo consolidamento è quello del job PostgreSQL GitHub Actions, completato con successo sul commit `44dde7d`; è un servizio PostgreSQL 17 isolato con dati sintetici, non un collaudo Auth/PostgREST gestito.

Le 16 prove Playwright della suite frontend usano risposte Auth/RPC sintetiche intercettate dal browser. Convalidano il comportamento UI/client, ma non provano GoTrue, PostgREST, RLS o configurazione Auth reali. Anche `tools/staging_probe.py` non va reindirizzato a un endpoint locale: `staging_connection()` impone ref cloud verificato, host diretto `db.<ref>.supabase.co`, TLS `verify-full` e marker; queste guardie restano intatte.

### Percorso proposto, non ancora eseguito

Quando sarà autorizzata un'ulteriore modifica locale, il percorso privo di progetto Supabase cloud consiste in un workflow manuale su un runner Linux GitHub effimero che avvia una **stack Supabase locale** con Supabase CLI e servizi containerizzati sul runner ospitato. Non richiede Docker sul PC Windows, credenziali GitHub, accesso al progetto di produzione, un nuovo progetto cloud o NAS. La preparazione richiede un harness distinto dai comandi `staging_*`, con URL localhost e controlli che rifiutino host non-loopback; non deve allentare `staging_connection()` o riutilizzare credenziali di produzione.

Sequenza per il workflow/harness da predisporre:

1. Usare una versione CLI e immagini fissate; creare il progetto locale temporaneo solo dentro il runner e senza `supabase link`/push di schema.
2. Applicare nell'istanza temporanea `bootstrap.sql`, `dashboard.sql`, migrazioni `0034` e `0035` in ordine. Verificare identità/porta del cluster e usare solo una fixture SQL sintetica su database vuoto; non usare la guardia loopback standard se il server container risponde da un IP interno. L'identità deve essere quella letta dal medesimo servizio effimero, come nel controllo `system_identifier` della CI.
3. Creare via Auth locale due account casuali sintetici, consentire Email/Password soltanto per la durata del job e inserire in allowlist soltanto l'UUID autorizzato.
4. Usare la chiave pubblica e gli URL localhost generati dallo stack; invocare Auth login/refresh/logout e PostgREST RPC con utente autorizzato, negato e anonimo. Verificare accesso diretto negato a `coaching`/`dashboard_private`, metadata, paginazione, bigint, revisione obsoleta `40001` e nessuna risposta parziale.
5. Spegnere la stack e scartare cluster, chiavi e utenti sintetici a fine job. Non salvarli come artefatti o log; nessun secret GitHub necessario.

Questo percorso eserciterebbe versioni self-hosted di Auth/PostgREST, ma non la configurazione gestita e TLS del progetto Supabase effettivo. Per quel gate il runbook attuale richiede un ambiente Supabase di staging separato; con il vincolo di non creare un progetto e senza autorizzazione/credenziali staging, il collaudo gestito rimane aperto. Non usare la produzione come sostituto.

## Vincoli rispettati e gate verso `main`

- Push eseguito soltanto per il commit autorizzato `44dde7d`; nessun push del successivo aggiornamento locale di questo report.
- Nessun merge, PR, deploy, migrazione o scrittura su produzione.
- Nessun Docker sul PC, installazione di servizi di sistema, NAS, accesso Supabase cloud o Garmin reale.
- Rimangono gate prima della promozione: collaudo Auth/PostgREST (almeno stack locale effimera; managed staging se richiesto per la release), verifica backup/restore locale quando PostgreSQL sarà disponibile e approvazione separata di PR/merge/deploy. La prova Garmin con dati autorizzati resta separata se richiesta.
- La promozione V3.4.1 deve mantenere l'ordine di migrazioni 0034/0035 e la checklist V2/V3 descritta sopra; la produzione resta invariata fino a istruzione separata.
