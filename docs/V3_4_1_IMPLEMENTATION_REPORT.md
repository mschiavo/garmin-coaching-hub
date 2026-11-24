# Report di implementazione V3.4.1

Branch `feature/v341-staging-reliability`, worktree permanente `D:\Repository\garmin-coaching-hub-dev`, base V3.4 `5b1700b892a6f6b3b29e22326978d42f0504982d`. Per ottenere lo SHA della consegna usare `git log -1 --format=%H -- docs/V3_4_1_IMPLEMENTATION_REPORT.md`.

## Correzione del job PostgreSQL

Sul commit pubblicato `cec87a11e3774b3578f9d7a7cfaed9dc5fd72d81`, Dashboard e Python sono passati. PostgreSQL ha eseguito gli otto test V3.4, poi ha fallito in `Reliability.setUpClass` durante il caricamento della fixture nel database previsto. Il log mostra il container su una rete Docker bridge e la pubblicazione della porta 5432. La guardia confrontava l’indirizzo del backend PostgreSQL con l’indirizzo loopback usato dal client. Il log contiene il predicato fallito e non registra l’indirizzo effettivo del backend. [Run 45416838248](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45416838248) · [Job PostgreSQL](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45416838248/job/138525245398)

La riproduzione locale ha usato PostgreSQL 17.9 e un inoltro TCP da `127.0.0.1` a `127.0.0.2`. Sul nome database previsto, la fixture estratta dal commit pubblicato ha restituito lo stesso errore. L’inoltro riproduce la differenza tra indirizzo client e backend. Docker non era disponibile nel worktree locale.

Il job correttivo acquisisce l’identificatore esatto del cluster dall’interno del servizio tramite `docker exec`. Lo verifica dal runner prima della creazione dei database e ad ogni connessione della suite. La fixture di test verifica ancora identificatore, nome del database e archivio vuoto prima degli insert. Il percorso locale predefinito conserva il controllo sul loopback lato server. Il percorso staging conserva le verifiche su ref, TLS e marker. [Runbook](V3_4_1_STAGING_RUNBOOK.md)

**Esito locale della correzione: 69 test passati**, inclusi i 67 precedenti. Training Load 5, Analytics/API 15, Chromium 16, Python 16, PostgreSQL 17. I 17 test SQL sono passati sia su loopback diretto sia tramite inoltro TCP. I nuovi casi verificano il rifiuto di identificatore errato o malformato, nome database errato, archivio popolato e backend inoltrato senza identità esplicita. Build e `py_compile` superati, chunk maggiore 393,56 kB e audit npm a zero vulnerabilità. Il job GitHub sul nuovo SHA resta da eseguire dopo pubblicazione autorizzata.

## Riproduzioni e modifiche

| Caso al commit base | Riscontro | Esito V3.4.1 |
| --- | --- | --- |
| Successo seguito da errore | Il test V3.4 attendeva esplicitamente che l’ultimo zero rimanesse utilizzabile nel confronto. | La prova storica rimane leggibile. Il confronto richiede ultimo tentativo riuscito e concordanza. |
| A archiviata, B restituita con lo stesso conteggio, poi ricerca vuota | Riprodotto su PostgreSQL locale con il writer originale. A e B rimanevano in archivio e il piano saltava il giorno. | Persistenza conservativa con conteggio delle attività non restituite e giornata nel piano di verifica. |
| Update legacy sullo stesso ID | Il writer originale aumentava la revisione e il piano continuava a saltare la giornata. | I trigger invalidano l’attestazione quando toccano l’archivio, anche a conteggio invariato. |
| Spostamento, metriche mancanti, dettaglio incompleto | Fixture con mock Garmin e database locale. | Entrambe le date coinvolte da uno spostamento richiedono verifica, gli scalari dello stesso ID sono conservati, il dettaglio fallito impedisce l’attestazione della finestra. |
| Pagine Garmin sovrapposte | Il codice originale accettava 51 elementi con 50 ID distinti. | Il writer rifiuta l’overlap e ricontrolla la prima pagina dopo una scansione multipagina. |
| Job incompleto con uscita normale | Riprodotto con sync V3.4 e cinque fonti mock incomplete. | Riepilogo condiviso e codici distinti per esito tecnico parziale o fallimento. Assenze di misure leggibili e giorno in corso restano casi operativi. |
| Sessioni e pagine in volo | Esteso il test browser a duplicati, logout remoto fallito e nuovo account. | L’archivio è rimosso dalla vista prima della risposta di logout. Le risposte abortite o della sessione precedente sono scartate. |

La ricerca offset può ancora subire cambiamenti invisibili nelle pagine successive. Il toolkit richiede connessione diretta TLS, ref distinto da produzione e marker approvato. Genera SQL da revisionare e lascia l’applicazione amministrativa all’operatore. PostgreSQL locale usa uno stub Auth. Il browser usa risposte HTTP sintetiche. Questi due ambienti misurano la logica locale e lasciano da verificare il servizio gestito.

## File consegnati

| Area | File |
| --- | --- |
| Persistenza | `supabase/migrations/0035_staging_reliability.sql` |
| Writer | `garmin_coverage.py`, `sync_garmin.py`, `import_garmin_history.py`, `repair_garmin.py` |
| Dashboard | `dashboard/src/QualityCenter.tsx`, `AdvancedAnalytics.tsx`, `main.tsx`, `dataApi.ts`, `supabaseKey.ts`, `analytics/coverage.ts`, `analytics/load.ts`, `analytics/weeklyReport.ts`, `dashboard/vite.config.ts` |
| Toolkit | `tools/staging_fixture.py`, `tools/staging_probe.py`, `tools/.env.example` |
| Test | `tests/test_garmin_coverage.py`, `tests/test_staging.py`, `tests/sql/test_reliability.py`, `dashboard/tests/data-api.test.mjs`, `advanced-analytics.spec.ts`, `data-intelligence.spec.ts`, `dashboard/playwright.config.ts` |
| CI | `.github/workflows/community-checks.yml`, `garmin-sync.yml`, `garmin-history.yml` |
| Guide | `README.md`, `docs/V3_4_MIGRATION_GUIDE.md`, contratto, runbook e report V3.4.1 |

## Verifiche locali

| Suite | Baseline 5b1700b | V3.4.1 |
| --- | ---: | ---: |
| Training Load | 5 | 5 |
| Analytics/API Node | 13 | 15 |
| Playwright Chromium | 14 | 16 |
| Python | 9 | 15 |
| PostgreSQL | 8 | 16 |
| **Totale** | **49** | **67** |

- Node 22.23.5, Python 3.12.16 e PostgreSQL 17.9. Installazione npm, build e compilazione Python completate. Il chunk massimo è Recharts da 393,56 kB. `npm audit` ha riportato zero vulnerabilità. Lockfile e migrazione pubblicata 0034 identici alla base.
- PostgreSQL isolato ha verificato fresh install, upgrade, rollback della migrazione, riapplicazione, trigger, ruoli web e writer minimo, lock, rollback a commit fallito, pagine e revisioni. I writer estratti dai commit originali V3.3 e V3.4 hanno anche scritto con ruoli distinti contro 0035 in un database sintetico locale.
- Backup e restore custom con PostgreSQL 17.9 su un secondo database locale. Verificati TOC, 2.503 attività fisiche, 2.501 giornate, 6 evidenze, 1 riga allowlist, min/max, 12 definizioni di funzioni, proprietari e ACL. RPC legacy e metadata V2 equivalenti tra origine e ripristino.
- Chromium ha coperto viewport 1440/375/390, legacy, annullamento, cambio account, piano JSON, conteggi, duplicati, errori e retry, Markdown, grafici e linea 1×. Le aspettative aggiornate riguardano il divieto di confronto su ultimo tentativo fallito, la distinzione tra deduplica del dettaglio e rifiuto delle pagine duplicate, e l’etichetta di somma parziale nell’export.
- Revisione Git selettiva, controllo whitespace e scansione segreti sullo staging Git come gate del commit. I database e i dump sintetici restano nella cache ignorata, insieme agli output dei test.

## CI remota e gate

L’esito della CI sul commit correttivo pubblicato e la checklist di staging sono nel [report operativo](V3_4_1_OPERATIONS_REPORT.md).

- V3.4, SHA `5b1700b892a6f6b3b29e22326978d42f0504982d`. Workflow push Community Edition Checks completato con success per `dashboard`, `postgresql` e `python`. [Run 45408402927](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45408402927)
- V3.3, SHA `f117f98073a4544b4099c5483ef0514ec3132d72`. Workflow push Community Edition Checks completato con success per `dashboard` e `python`. [Run 45387073449](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45387073449)
- **Gate A**, verifiche locali superate. **Gate B**, il commit V3.4.1 iniziale è pubblicato e il job PostgreSQL è fallito. La correzione locale richiede pubblicazione autorizzata e verifica della CI per SHA. **Gate C**, richiede Auth/PostgREST, frontend e ripristino su staging Supabase separato. **Gate D**, richiede Garmin autorizzata per 1–3 giorni chiusi. La decisione di rollout viene dopo C e D. [Runbook](V3_4_1_STAGING_RUNBOOK.md)

## Riferimenti protetti

SHA rilevati nel preflight dopo fetch. I riferimenti di versioni precedenti sono stati tenuti fuori dalle modifiche del branch.

| Riferimento | SHA |
| --- | --- |
| `main` | `58df16989f8d781672dc6b5278efb91a7187bed4` |
| `feature/community-v3-beta` | `3a363ab29cba4e97fa46dc39dbf1405af856252a` |
| `feature/v32-recharts-migration` | `ba30c08b7ecd8836b7a3492a6f183fa7c93ac52c` |
| `feature/v33-advanced-running-analytics` | `f117f98073a4544b4099c5483ef0514ec3132d72` |
| `feature/v34-data-intelligence` | `5b1700b892a6f6b3b29e22326978d42f0504982d` |
| Oggetto tag `v3.1.5-beta.1` | `a402cdd7e8868a92d7fc86e8aaa81f1492f6ffeb` |
| Commit del tag | `3a363ab29cba4e97fa46dc39dbf1405af856252a` |

## Pulizia assistita

V3.2 e V3.3 erano puliti, senza untracked visibili. V3.2 è raggiungibile dai riferimenti origin V3.2, V3.3 e V3.4. V3.3 è raggiungibile da origin V3.3 e V3.4. In entrambi sono presenti `__pycache__/`, `tests/__pycache__/`, `dashboard/node_modules/`, `dashboard/dist/`, `dashboard/tsconfig.tsbuildinfo` e `dashboard/test-results/`. L’inventario Git non ha rilevato configurazioni locali ignorate o file .env privati. La scansione delle righe di comando non ha trovato percorsi espliciti dei due worktree. I processi con soli percorsi relativi richiedono verifica manuale di IDE, terminali e server.

Dopo autorizzazione separata, ricontrollare status, commit raggiungibili e processi. Conservare selettivamente test-results e gli eventuali report o configurazioni irrecuperabili individuati in quel momento. Cache, node_modules, dist e tsbuildinfo sono rigenerabili. Tentare separatamente `git worktree remove D:\Repository\garmin-coaching-hub-v32` e `git worktree remove D:\Repository\garmin-coaching-hub-v33`, senza force. Se il comando rifiuta una cartella, verificare il motivo e ottenere approvazione mirata prima di rimuovere soltanto gli output rigenerabili identificati. Concludere con `git worktree list` e lasciare intatti i branch e i worktree principale e dev.

Dopo eventuale approvazione del Gate B, il comando di pubblicazione è `git push -u origin feature/v341-staging-reliability`. In questa consegna le operazioni remote sono state letture Git/GitHub. Push, merge, deploy, avvii workflow, operazioni su Supabase cloud, accessi Garmin reali e rimozioni worktree eseguiti durante l’incarico sono pari a zero.
