# Consolidamento repository Garmin Coaching Hub

**Data:** 24 novembre 2026
**Worktree:** `D:\Repository\garmin-coaching-hub-dev`
**Branch di lavoro:** `feature/v341-staging-reliability`

## Esito sintetico

La verifica Git e la CI sul commit già pubblicato V3.4.1 sono positive. Ho mantenuto intatti i branch e tutti i worktree. I risultati Playwright sintetici utili dei worktree V3.2/V3.3 sono stati copiati con hash verificabili in `D:\Repository\garmin-release-evidence\consolidation-2026-11-24`; il relativo `manifest.json` è locale e fuori da Git.

Sono passati build, test Python e test dashboard (54 test eseguiti, tutti superati), audit npm e scansione Gitleaks della cronologia. La suite SQL/restore non è stata eseguita localmente: in questa macchina non sono disponibili PostgreSQL né i suoi eseguibili. Il gate PostgreSQL rimane comunque verificato dalla CI GitHub sullo SHA V3.4.1 già pubblicato. Nessun accesso è stato fatto a Supabase, Garmin o NAS.

Questo report è l'unico file tracciato aggiunto nell'intervento. Non contiene credenziali né dati Garmin.

## Riferimenti Git e CI

È stato eseguito `git fetch --prune origin`; non sono stati modificati branch locali. Tutti i riferimenti richiesti coincidono con i rispettivi riferimenti remoti:

| Riferimento | SHA locale e remoto |
| --- | --- |
| `main` | `58df16989f8d781672dc6b5278efb91a7187bed4` |
| `feature/community-v3-beta` | `3a363ab29cba4e97fa46dc39dbf1405af856252a` |
| `feature/v32-recharts-migration` | `ba30c08b7ecd8836b7a3492a6f183fa7c93ac52c` |
| `feature/v33-advanced-running-analytics` | `f117f98073a4544b4099c5483ef0514ec3132d72` |
| `feature/v34-data-intelligence` | `5b1700b892a6f6b3b29e22326978d42f0504982d` |
| `feature/v341-staging-reliability` | `15f69db4d76ea59aa96df68bfeab40152a851644` |

Il tag `v3.1.5-beta.1` punta al commit `3a363ab29cba4e97fa46dc39dbf1405af856252a`; il tag e i ref storici non sono stati alterati.

La run GitHub Actions [45427744794](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45427744794) è `completed / success` sullo SHA esatto `15f69db4d76ea59aa96df68bfeab40152a851644`. Sono verdi i job Dashboard, Python e PostgreSQL.

## Inventario worktree e processi

| Cartella | Branch / HEAD | Stato e decisione |
| --- | --- | --- |
| `D:\Repository\garmin-coaching-hub` | beta / `3a363ab` | È il worktree beta permanente da conservare. Ci sono due file non tracciati e output ignorati locali; non li ho aperti o modificati. È stato rilevato `agy.exe` con un percorso esplicito in questa cartella: non terminato. È presente anche `dashboard/.env.local`, non letto, copiato o incluso nel report. |
| `D:\Repository\garmin-coaching-hub-dev` | V3.4.1 / `15f69db` | Worktree permanente di questa attività. Prima dell'aggiunta del report era pulito; sono presenti normali cache e dipendenze ignorate. |
| `D:\Repository\garmin-coaching-hub-v32` | V3.2 / `ba30c08` | Branch pulito, ref remoto esatto, nessun processo con percorso esplicito. Dry-run: solo output ignorati rigenerabili e `dashboard/test-results`. Non rimosso. |
| `D:\Repository\garmin-coaching-hub-v33` | V3.3 / `f117f98` | Branch pulito, ref remoto esatto, nessun processo con percorso esplicito. Dry-run: solo output ignorati rigenerabili e `dashboard/test-results`. Non rimosso. |

Il controllo processi rileva percorsi nei command line o negli eseguibili, non il working directory implicito di finestre terminale/IDE. Prima di una futura rimozione l'operatore deve chiudere e verificare manualmente quelle sessioni. Non ho eseguito comandi di rimozione o cancellazione.

### Artefatti beta da preservare

Il worktree beta contiene due file non tracciati (`INSTALL-V315.txt`, 333 byte; SHA-256 `69482501C3AFC0AD3F1F3A90D4220E1D9867D937A643116584CD60F34DE69D15`; `garmin_v32_one_shot.py`, 24.418 byte; SHA-256 `32EDD73226C9E6DB854CE904E73E4FD68ED6C9A1C3D59459716BF7E8EAD270A3`). I contenuti non sono stati letti; restano sul posto per la revisione del proprietario.

Sono inoltre presenti sei archivi ZIP ignorati, non estratti né copiati: `garmin-v3-1-1-chart-usability-fix.zip` (3.516 byte), `garmin-v3-1-2-cartesian-all-charts.zip` (6.127), `garmin-v3-1-3-cartesian-axes-fixed.zip` (3.815), `garmin-v3-1-3-cartesian-axes.zip` (8.155), `garmin-v3-1-4-interactive-charts.zip` (2.800), `garmin-v3-1-5-community-beta.zip` (6.672). Restano nella cartella originale. Gli altri ignorati includono `dashboard/dist`, `dashboard/node_modules`, `dashboard/tsconfig.tsbuildinfo`, cache Python e due backup CSS/TSX pre-V3.1.2; non sono stati modificati.

### Evidenze V3.2/V3.3 conservate

Il dry-run `pwsh -NoProfile -File tools/Remove-V341LegacyWorktree.ps1` conferma per entrambi HEAD e branch previsti, ref remoto corrispondente, zero modifiche/untracked e zero processi con percorso esplicito. Gli ignorati rilevati sono `__pycache__`, `tests/__pycache__`, `dashboard/node_modules`, `dashboard/dist`, `dashboard/tsconfig.tsbuildinfo` e `dashboard/test-results`.

`dashboard/test-results` V3.2 conteneva solo `.last-run.json` con stato `passed` e nessun test fallito. V3.3 conteneva lo stesso metadato e due report sintetici, desktop e mobile, relativi al test analytics. Tutti e quattro i file sono stati copiati fuori dai worktree; i report desktop/mobile hanno lo stesso SHA perché i contenuti sono identici. Ogni percorso originale, dimensione, classificazione e SHA-256 è nel [manifesto locale](D:/Repository/garmin-release-evidence/consolidation-2026-11-24/manifest.json). L'evidenza contiene soltanto output sintetici. Nessun `.env`, database, `node_modules`, `dist` o cache è stato copiato.

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
| Gitleaks 8.30.1 su tutti i ref/34 commit | 0 segreti rilevati su circa 775 kB. |
| PostgreSQL locale 17 / restore isolato | Non eseguito: nessun `psql`, `pg_ctl`, `pg_dump`, `pg_restore` o servizio PostgreSQL disponibile. Nessun database remoto è stato usato come sostituto. |

Node 22.23.5, fissato dal progetto alla major 22, è stato scaricato in `.cache` come runtime portatile; SHA-256 verificato contro il manifesto ufficiale Node.js. Gitleaks 8.30.1 è stato scaricato in `.cache` e verificato col file checksum ufficiale della release. Non sono state installate applicazioni o servizi di sistema. Il primo tentativo con il Node globale 20.10.0 aveva superato la build ma non poteva caricare i moduli TypeScript dei test; la suite è stata poi rieseguita e superata con Node 22.23.5.

La cronologia CI sul commit esatto ha eseguito anche i test SQL su PostgreSQL 17 containerizzato. I 71 test V3.4.1 riportati nel report operativo precedente sono quindi coerenti con i 54 test Python/dashboard ripetuti qui e con il job PostgreSQL remoto verde; la parte PostgreSQL non è una verifica locale di questa sessione.

## Percorso Git e passaggio a un'unica applicazione ufficiale

Modello proposto:

- `main` resta il ramo stabile della produzione.
- `feature/*` contiene branch temporanei di lavoro. `garmin-coaching-hub-dev` è la cartella/worktree di sviluppo, non un branch `dev` obbligatorio.
- Il worktree beta resta disponibile finché il tester lo usa. Conservare tag e branch V3.2/V3.3/V3.4 per riproducibilità e confronto; non consumano installazioni una volta approvata la rimozione dei worktree.
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

## Piano di rimozione da approvare separatamente

**Non eseguire questi comandi senza una successiva approvazione esplicita.** Dopo aver conservato il manifesto, chiuso IDE/terminali/server e verificato manualmente l'assenza di sessioni con working directory implicita, eliminare soltanto gli output ignorati elencati dal dry-run. Non usare `-Force`:

```powershell
$v32 = @(
  'D:\Repository\garmin-coaching-hub-v32\__pycache__',
  'D:\Repository\garmin-coaching-hub-v32\tests\__pycache__',
  'D:\Repository\garmin-coaching-hub-v32\dashboard\node_modules',
  'D:\Repository\garmin-coaching-hub-v32\dashboard\dist',
  'D:\Repository\garmin-coaching-hub-v32\dashboard\tsconfig.tsbuildinfo',
  'D:\Repository\garmin-coaching-hub-v32\dashboard\test-results'
)
Remove-Item -LiteralPath $v32 -Recurse
pwsh -NoProfile -File tools/Remove-V341LegacyWorktree.ps1 -Remove -Target V32 -ConfirmClosed

$v33 = @(
  'D:\Repository\garmin-coaching-hub-v33\__pycache__',
  'D:\Repository\garmin-coaching-hub-v33\tests\__pycache__',
  'D:\Repository\garmin-coaching-hub-v33\dashboard\node_modules',
  'D:\Repository\garmin-coaching-hub-v33\dashboard\dist',
  'D:\Repository\garmin-coaching-hub-v33\dashboard\tsconfig.tsbuildinfo',
  'D:\Repository\garmin-coaching-hub-v33\dashboard\test-results'
)
Remove-Item -LiteralPath $v33 -Recurse
pwsh -NoProfile -File tools/Remove-V341LegacyWorktree.ps1 -Remove -Target V33 -ConfirmClosed
```

La rimozione è un worktree per volta, senza `git worktree remove --force`; il controllo dello script deve restare verde. I branch locali/remoti e il tag storico non vanno rimossi. Lo stato desiderato dopo approvazione è costituito dai due worktree permanenti beta e sviluppo.

## Operazioni escluse e gate residui

- Nessun push, merge, deploy, migrazione o scrittura su produzione.
- Nessun accesso a Supabase cloud, Garmin reale o NAS; nessuna credenziale reale acquisita.
- Nessuna installazione Docker, nessuna creazione o rimozione di worktree, nessuna modifica ai branch/tag storici.
- Restano da autorizzare separatamente: rimozione V3.2/V3.3, eventuale prova su progetto Supabase dedicato, eventuale prova Garmin autorizzata e promozione/PR/merge/deploy verso `main`.
- Prima della rimozione il proprietario deve confermare che i quattro artefatti copiati siano leggibili e conservati nella directory esterna indicata.
