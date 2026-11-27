# V4.1 — Audit filesystem e repository

**Data inventario:** 27 novembre 2026. **Perimetro letto:** `D:\Repository` e progetti Garmin: beta `garmin-coaching-hub`, DEV V3.4.1, V4, kit `garmin-v4-planning`, evidenze `garmin-release-evidence`. Nessun file è stato eliminato, spostato o modificato durante l'inventario. I contenuti dei file potenzialmente segreti non sono stati letti.

> Il file richiesto `D:\Repository\CODEX_V4_1_DATA_ARCHITECTURE_CON_AUDIT_FILESYSTEM.md` non era presente. La ricerca dei nomi esatti/simili fra i file visibili sotto `D:\Repository` non ha trovato una copia. Questo audit soddisfa le categorie indicate nella richiesta, ma non può attestare istruzioni ulteriori contenute nella Fase F mancante.

## Worktree, branch e stato Git

`git worktree list --porcelain` mostra soltanto:

| Percorso | Branch | HEAD | Stato |
|---|---|---|---|
| `D:\Repository\garmin-coaching-hub` | `feature/community-v3-beta` | `3a363ab29cba4e97fa46dc39dbf1405af856252a` | Due file non tracciati, elencati sotto; nessun file tracked modificato rilevato |
| `D:\Repository\garmin-coaching-hub-dev` | `feature/v341-staging-reliability` | `8fda8bbf84bc40f191fdfee32ec5d6a374044454` | worktree tracked/untracked pulito; solo ignored build/cache |
| `D:\Repository\garmin-coaching-hub-v4` | `feature/v4-visual-foundation` | `af7a26cde1c0fe5504dd76388158ea7271019eab` all'inizio audit | pulito all'inizio; durante la stesura sono stati creati solo i tre documenti richiesti |

I refs locali osservati nel repository condiviso includono `main` (`58df169`), `feature/community-edition-foundation` (`e0856ef`), `feature/community-v3-beta` (`3a363ab`), `feature/v3-training-load` (`8178c76`), `feature/v32-recharts-migration` (`ba30c08`), `feature/v33-advanced-running-analytics` (`f117f98`), `feature/v34-data-intelligence` (`5b1700b`), `feature/v341-staging-reliability` (`8fda8bb`) e `feature/v4-visual-foundation` (`af7a26c`). Nessun fetch né controllo remoto è stato effettuato. I branch storici restano refs, non sono directory/worktree aggiuntivi.

## Classificazioni

### 1. Conservare

| Percorso | Dimensione | Riferimenti/evidenza | Rischio se rimosso |
|---|---:|---|---|
| `garmin-coaching-hub\dashboard\.env.local` | 136 B | Ignorato da Git; non letto per non esporre eventuali credenziali | Alto: può contenere segreti/config locale; conservarlo e non inserirlo in report/log/commit |
| `garmin-coaching-hub\dashboard\src\main.tsx.pre-v312.bak` | 36.617 B | `tools/apply_v312_cartesian_all_charts.py` crea il suffisso; `docs/V3_1_2_CARTESIAN_ALL_CHARTS.md` spiega il backup | Medio: ripristino storico di sorgente; non eliminare automaticamente |
| `garmin-coaching-hub\dashboard\src\style.css.pre-v312.bak` | 17.377 B | Stesso script e documento lo citano | Medio: backup storico CSS |
| Sei ZIP beta sotto `garmin-coaching-hub\garmin-v3-1-*.zip` | 3.516; 6.127; 3.815; 8.155; 2.800; 6.672 B (31.085 B totali) | Nomi/versioni V3.1.1–V3.1.5; nessun riferimento testuale esatto trovato nel codice scansionato. Hash SHA-256 distinti | Medio: pacchetti storici/beta potenzialmente distribuiti; non sono duplicati byte-identici, non cancellare senza verifica archivistica |
| `garmin-release-evidence\consolidation-2026-11-24\` | Manifest e copie test V3.2/V3.3 | Evidenze storiche con `manifest.json`, `.last-run.json` e risultati test; area separata dal worktree | Alto: prova di conservazione/release; non toccare né spostare |
| `garmin-v4-planning\mockup\01_...` fino a `06_...png` | Sei immagini; asset di riferimento | Mockup ufficiali usati nei precedenti sprint V4 e citati dalla documentazione | Alto: riferimenti visuali approvati; conservare |
| `garmin-coaching-hub-v4\dashboard\test-results\v4-advanced-preview\` e `v4-visual-preview\` | 8.873.286 B + 5.194.562 B = 14.067.848 B; test-results totale 14.071.209 B | PNG desktop/mobile/light/zoom delle quattro preview, `.last-run.json` e artefatti Playwright | Medio/alto: screenshot e report sono evidenza visuale di sprint; archiviare prima di qualunque pulizia |
| `garmin-coaching-hub-dev\dashboard\test-results\` | 3.361 B | output Playwright locale V3.4.1 ignorato | Medio: evidenza test V3.4.1; preserve per vincolo V3 |
| `garmin-coaching-hub\INSTALL-V315.txt` | 333 B, untracked | Istruzioni indicano branch beta, script V3.1.5, Node/npm, unittest; nessun riferimento automatico trovato | Medio: documento utente/operativo non committato; verificare autore/intento prima di archiviare |
| `garmin-coaching-hub\garmin_v32_one_shot.py` | 24.418 B, untracked | Header descrive azione one-shot/worktree; codice non eseguito; nessun riferimento in automazioni trovato; report consolidamento precedente registra hash | Alto: può orchestrare branch/worktree; non eseguire né cancellare senza review del proprietario |
| Reports e migrazioni versionate nei tre worktree | Variabile | Storico di release, procedure, test/regressioni; V3.4.1 report presente anche identico byte-per-byte nel checkout V4 (SHA-256 `4FAC…8BFE2`, 18.729 B) | Alto: duplicazione cross-worktree intenzionale/documentale, utile per contesto e handoff; non eliminare |

### 2. Archiviare

| Percorso/insieme | Dimensione | Motivo e riferimenti | Rischio / azione |
|---|---:|---|---|
| Screenshot e output `garmin-coaching-hub-v4\dashboard\test-results\v4-*` | 14.067.848 B nei due report di preview | Risultati visuali V4 utili ma rigenerabili dai test; ignorati da Git, non versionati | Prima di pulizie future, copiare in un archivio V4 con indice/hash e mantenere l'originale fino a verifica. Nessuna copia eseguita ora |
| Eventuali futuri report `test-results` ripetuti in DEV | 3.361 B | Artefatti test locale e rigenerabile, ma il contesto V3.4.1 va conservato | Archiviare solo nel processo di conservazione V3 autorizzato; nessuna azione ora |

### 3. Eliminabile con sicurezza dopo autorizzazione (solo V4)

Questi sono output/cache ignorati, ricostruibili, ma non rimossi in questo audit. Totale misurato: **162.264.643 byte (~154,8 MiB)**, senza includere screenshot `test-results`.

| Percorso V4 | Dimensione | Prova di rigenerabilità/riferimenti | Rischio |
|---|---:|---|---|
| `garmin-coaching-hub-v4\dashboard\node_modules\` | 160.812.471 B | Dipendenze da `dashboard/package-lock.json`; ripristinabili con `npm ci` | Medio: richiede rete e tempo, nessuna cancellazione senza approvazione |
| `garmin-coaching-hub-v4\dashboard\dist\` | 1.165.886 B | Build `npm run build` da sorgenti | Basso, ma contiene build corrente non versionata; ricostruibile |
| `garmin-coaching-hub-v4\dashboard\tsconfig.tsbuildinfo` | 894 B | Cache incrementale TypeScript | Basso; rigenerata da build |
| `garmin-coaching-hub-v4\__pycache__\`, `tests\__pycache__\`, `tests\sql\__pycache__\`, `tools\__pycache__\` | 285.392 B | Bytecode Python ignorato e rigenerato da interpreter/test | Basso; verificare che non vi siano file non-cache prima di una futura azione |

Sono esclusi da questa lista i test-results, perché contengono screenshot/documentazione visuale; qualsiasi eliminazione futura dovrebbe passare da archiviazione e hash verificati. La lista non autorizza `git clean` né cancellazioni generiche.

### 4. Da verificare manualmente

| Percorso/insieme | Dimensione rilevata | Riferimenti/risultato | Rischio e domanda |
|---|---:|---|---|
| `garmin-coaching-hub-dev\.cache\` | 4.339.023.253 B (~4,04 GiB) | Ignorata; non è stato enumerato né aperto il contenuto. Appare cache strumenti, ma non si assume che sia tutta rigenerabile | Molto alto: può includere installer/binari cache o prove locali. Audit di manifest/owner richiesto; inoltre è worktree V3.4.1, escluso da modifiche |
| `garmin-coaching-hub-dev\.venv\` | 60.029.706 B | Ambiente Python locale ignorato; ricostruibilità dipende da lock/requirements presenti | Medio; V3.4.1 fuori scope. Verificare versione e dipendenze prima di cleanup autorizzato |
| `garmin-coaching-hub-dev\dashboard\node_modules\` | 160.810.975 B | Ignorata; rigenerabile con npm e lockfile | V3.4.1 è fuori perimetro: non rimuovere in questo intervento |
| `garmin-coaching-hub-dev\dashboard\dist\` | 1.070.654 B | Build ignorata, rigenerabile | V3.4.1 è fuori perimetro |
| `.cache`, `.venv`, Python cache, `dashboard/test-results`, `dashboard/tsconfig.tsbuildinfo` sotto `garmin-coaching-hub-dev` | 4.339.023.253 B; 60.029.706 B; `__pycache__` 128.194 B, `tests\__pycache__` 145.287 B, `tests\sql\__pycache__` 68.203 B, `tools\__pycache__` 130.005 B; test-results 3.361 B; tsbuildinfo 420 B | Tutti ignorati; cache/build presumibilmente ricostruibili, test-results sono evidenza | Worktree V3.4.1 fuori perimetro; `.cache` non esaminata, test-results da preservare. Qualsiasi pulizia richiede decisione separata |
| `garmin-coaching-hub\dashboard\node_modules\` | 111.660.063 B | Ignorata, lockfile disponibile | Worktree beta con file untracked; non rimuovere finché il proprietario non verifica uso/stato |
| `garmin-coaching-hub\dashboard\dist\` | 956.033 B | Build beta ignorata, rigenerabile | Branch beta operativo: non rimuovere in questo sprint |
| Python cache beta e `dashboard/tsconfig.tsbuildinfo` | `__pycache__` 28.382 B; `tests\__pycache__` 3.975 B; `tools\__pycache__` 8.450 B; tsbuildinfo 91 B | Bytecode/cache ignorati | Branch beta e file untracked non revisionati: preservare |
| `main.tsx.pre-v312.bak`, `style.css.pre-v312.bak`, ZIP e backup storici | Vedi sezione Conservare | Riferimenti provano generazione/storia, non inutilità | Review proprietario archivio, non candidato automatizzato |
| `garmin_v32_one_shot.py` | 24.418 B | Script one-shot locale senza call site automatici; header e contenuto indicano operazioni git/worktree | Verificare se è ancora necessario e se è stato approvato; non eseguirlo durante audit |

## Script e dipendenze

Non ho classificato come obsoleti gli script tracked del progetto: tool di migrazione/import/manutenzione possono essere entrypoint operativi non importati dal frontend. Gli script V3 sono fuori perimetro di modifica; quello one-shot non tracciato resta da review manuale. Gli script che producono `.pre-v312.bak` sono referenziati da `docs/V3_1_2_CARTESIAN_ALL_CHARTS.md`.

Audit dipendenze V4 (`dashboard/package.json`, lockfile e `npm ls --depth=0`): tutte le dipendenze risultano installate. Sorgenti usano React/React DOM, Supabase JS, Recharts e Lucide; TypeScript/Vite/Playwright sono tool di build/test. `react-is` non è importato direttamente dall'app, ma `npm explain react-is` dimostra che Recharts 3.11 lo dichiara peer dependency; **non è un candidato dimostrato alla rimozione**. Non ho modificato package/lockfile.

## Duplicati e documenti

Hash SHA-256 ha rilevato `docs/REPOSITORY_CONSOLIDATION_REPORT.md` in DEV V3.4.1 e V4 identico (`4FAC…8BFE2`, 18.729 B). È una copia fra worktree, non un duplicato nello stesso repository; conservare entrambe per separazione storica. I report V4 Sprint 01/01B/01C/01D sono revisioni cronologiche distinte e non candidati a fusione/rimozione. Sei ZIP hanno hash distinti; non risultano copie byte-identiche nel set controllato.

## Spazio potenzialmente recuperabile

Solo nel worktree V4, cache/build esclusi gli screenshot: **162.264.643 B** (~154,8 MiB). Il totale delle cache ignorate misurate nei tre worktree è molto maggiore, ma non è un target di pulizia: DEV contiene una `.cache` da 4.339.023.253 B, `.venv`, `node_modules` e artefatti V3.4.1; beta ha file non tracciati e backup. Nessuno di questi è stato rimosso. Gli screenshot V4 (14.067.848 B nei due insiemi principali) sono da conservare/archiviare.

## Verifiche effettuate

- Git worktree/branch/HEAD, status tracked/untracked e status ignored nei tre repository Git.
- Metadati di percorso/dimensione per candidati; nessun contenuto `.env` letto.
- Ricerche call-site di nomi backup/script e dipendenze nel sorgente.
- `npm ls --depth=0` e `npm explain react-is` locali (non modificano manifest/lockfile).
- Nessun processo, directory esterna ai percorsi elencati, database o servizio cloud è stato toccato. Non è stata eseguita una cancellazione né un'archiviazione fisica.
