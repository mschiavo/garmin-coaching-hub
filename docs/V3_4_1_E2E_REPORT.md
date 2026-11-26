# Report operativo — collaudo E2E V3.4.1

**Data:** 26 novembre 2026
**Branch:** `feature/v341-staging-reliability`
**Worktree:** `D:\Repository\garmin-coaching-hub-dev`

## Implementazione

È stato aggiunto [`v341-local-supabase-e2e.yml`](../.github/workflows/v341-local-supabase-e2e.yml), eseguibile prima del merge da un trigger `push` temporaneo limitato al branch `feature/v341-staging-reliability` e ai file del workflow, harness, SQL, dipendenze, dashboard e test interessati. `workflow_dispatch` resta disponibile per usi successivi, ma GitHub lo abilita solo quando la definizione è presente sul branch predefinito: non è il metodo di avvio per questo pre-merge gate. Il runner GitHub-hosted Linux `ubuntu-24.04` è effimero. La workflow ha `contents: read`, checkout senza credenziali persistenti, action con SHA completi, Python 3.12.8, Node 22.23.5 e Supabase CLI 3.4.0. Avvia la stack tramite CLI senza `supabase link` ed esclude i servizi non richiesti. Le immagini non sono impostabili con le chiavi `*.image` nel TOML riconosciute dalla CLI 3.4.0: la versione fissata della CLI porta il proprio manifest d'immagini, verificabile nel [Dockerfile del tag v3.4.0](https://github.com/supabase/cli/blob/v3.4.0/apps/cli/src/shared/services/Dockerfile). Dopo l'avvio il workflow richiede esattamente i tag PostgreSQL `17.12.0.002`, GoTrue `v2.198.0`, PostgREST `v16.6` e Kong `2.8.1`; ogni deriva interrompe il gate. Il runner non ha ambienti o secrets associati alla workflow; i riferimenti `secrets.*` sono assenti.

La causa del fallimento sul commit `b2d4a4f6ada7a0f4b53f1a75a856cc0e85610d63` era la configurazione TOML: `api.image`, `api.kong_image`, `db.image` e `auth.image` non sono chiavi accettate, mentre `auth.email.enable_signup` è deprecata. Il file ora rimuove queste chiavi, usa `auth.email.enabled = true` (chiave non deprecata in CLI v3) e mantiene `auth.enable_signup = true` per consentire la registrazione sintetica. La configurazione è stata validata con il binario ufficiale Supabase CLI 3.4.0, scaricato dal tag release e verificato tramite SHA-256: esito `valid: true`, nessun warning o errore. La CLI supporta esplicitamente `auth.email.enabled`; la [guida di migrazione v3](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3) distingue questa opzione dal controllo signup in `[auth]`.

La CLI pubblica le porte Docker senza indicare un host IP. Per non esporre i servizi sulle interfacce di rete del runner, il workflow crea una rete bridge dedicata con `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, la passa alla CLI tramite `SUPABASE_NETWORK_ID` e rifiuta l'avvio se driver/opzione/etichetta non coincidono. Dopo l'avvio ispeziona i quattro container del progetto: controlla tag immagine, rete d'appartenenza e `HostIp=127.0.0.1` per ogni porta pubblicata. È il meccanismo Docker previsto per la rete utente ([Docker: bridge host binding](https://docs.docker.com/engine/network/drivers/bridge/#default-host-binding-address)); il cleanup `always()` ferma la stack, rimuove la rete etichettata e cancella soltanto la directory temporanea esatta.

[`local_supabase_e2e.py`](../tools/local_supabase_e2e.py) accetta solo API `http://127.0.0.1:54321` e PostgreSQL `127.0.0.1:54322`, ruolo e database `postgres`, cioè il database predefinito al quale GoTrue e PostgREST della stack Supabase locale sono collegati. Il progetto/cluster è appena avviato e le tabelle applicative sono installate lì; la fixture verifica che l’archivio `coaching` sia vuoto prima di scrivere. Il probe confronta il system identifier ottenuto direttamente dal container con quello del DSN loopback e lo ricontrolla prima dei passaggi DB. Rifiuta loopback alternativi, hostname, qualsiasi IP privato/esterno, porta/database/ruolo diversi e identity non corrispondente. La fixture accetta questo nome DB solo con il flag locale esplicito e system identifier; la modalità normale e `staging_connection()` restano invariate.

Il database `postgres` della nuova stack effimera riceve, nell’ordine, `bootstrap.sql`, `dashboard.sql`, 0034 e 0035; la fixture large viene applicata dopo i controlli d’identità e di archivio applicativo vuoto. La stack genera due account `example.invalid` casuali; l’allowlist include un solo UUID. I probe inviano richieste HTTP reali a Auth e PostgREST. Il frontend viene compilato e servito dalla build Vite di produzione; Playwright non usa `page.route`, fixture di rete o mock, e disabilita trace, screenshot e video. I log riportano soltanto fasi/esiti aggregati, mai password, JWT, chiavi o payload. Le credenziali sintetiche restano in memoria di processo e sono passate al browser via variabili d’ambiente del processo Playwright; non sono scritte su disco. L’output CLI resta in memoria e il parser conserva soltanto URL, DSN e chiave anonima. La service-role key non è importata né passata ai test/browser. La stack viene fermata e i container eliminati dal cleanup `always()`.

## Verifiche previste dal gate

- Auth signup sintetico, login password, refresh e logout per gli account temporanei.
- RPC anonime e account non allowlist rifiutate; account allowlist abilitato.
- Accesso PostgREST diretto a `coaching` e `dashboard_private` non esposto.
- Legacy `dashboard_data`, metadata e RPC V2; conteggi e paginazione delle tre collezioni.
- ID bigint maggiore di 2^53, revisione obsoleta (`40001`), aggiornamento sintetico e invalidazione osservata via RPC, input RPC non valido rifiutato.
- Dashboard reale: login, caricamento, sezioni Training Load/Advanced Analytics/Qualità, logout, cambio account e negazione dell’archivio per account escluso.
- Regression test statici del workflow e test unitari per URL/API, DB, porta, nome DB, system identifier e rifiuto di target cloud o indirizzi privati.

## Esecuzione e risultati

Il nuovo harness E2E Supabase/GoTrue/PostgREST e il Playwright live non sono stati avviati: il workflow remoto è vietato per questa consegna. Il runner locale non ha Docker né Supabase CLI e non è stata installata alcuna componente di sistema.

Le verifiche locali effettivamente eseguite sono:

| Controllo | Esito |
| --- | --- |
| Python `unittest discover -s tests` | 27 superati, inclusi i test dei target/workflow e dei filtri di attivazione |
| Test SQL `unittest discover -s tests/sql` | 17 superati su cluster PostgreSQL 17.9 portatile, sintetico e nuovo, porta loopback 55448; restore isolato verificato, cluster arrestato regolarmente e conservato in `.cache` con i soli dati sintetici |
| Dashboard Training Load | 5 superati |
| Dashboard Analytics/API | 15 superati |
| Playwright desktop/mobile preesistente | 16 superati |
| Build TypeScript/Vite | Superata; chunk maggiore 393,56 kB |
| `npm audit --audit-level=moderate` | 0 vulnerabilità |
| Python `py_compile` | Superata |
| Playwright discovery del nuovo test (`--list`) | 1 test rilevato; nessun servizio avviato |
| `actionlint` 1.7.12 | YAML e semantica della workflow superati |
| Gitleaks 8.30.1 e `git diff --cached --check` | 0 segreti rilevati; whitespace superato |

Nel controllo correttivo del 26 novembre 2026, `supabase config validate` eseguito con il binario CLI 3.4.0 sul TOML estratto dal workflow è passato senza warning; `actionlint`, 27 test Python, 17 test SQL e i controlli dashboard (5 Training Load, 15 Analytics/API, 16 Playwright), build, audit e Gitleaks sono stati rieseguiti. In questa macchina non è disponibile Docker: l'avvio effettivo dei container non è stato eseguito localmente. La nuova workflow contiene i controlli runtime di tag e binding, ma questi restano da confermare con una successiva esecuzione remota autorizzata. Non è stata avviata alcuna esecuzione GitHub in questa sessione.

La build di integrazione con endpoint locale e l’esecuzione del browser live non sono state simulate con risposte mock e non sono conteggiate come superate. Il test E2E verrà effettivamente esercitato dal push sul branch filtrato; nessuna esecuzione remota è stata avviata durante questo intervento.

La precedente CI sul commit pubblicato `44dde7d3a0a5830202d2b23bd0dfc154cb54a864` resta una verifica storica dei tre job esistenti, non include questo workflow. Per l'avvio pre-merge reale, dopo aver pubblicato un commit autorizzato che includa questa definizione, un push sul branch e su almeno uno dei percorsi filtrati avvia automaticamente il gate:

```powershell
git push origin feature/v341-staging-reliability
gh run list --workflow v341-local-supabase-e2e.yml --branch feature/v341-staging-reliability --limit 5
gh run watch <run-id>
```

Non usare `gh workflow run` come procedura pre-merge: il trigger manuale non è selezionabile finché il workflow non è presente su `main`. Dopo il gate E2E verde, disattivare il trigger temporaneo rimuovendo solo il blocco `push:` (branch e `paths`) in un successivo commit del branch; mantenere `workflow_dispatch` se serve per esecuzioni future dopo che il workflow sarà disponibile sul branch predefinito. La rimozione del trigger non esegue né richiede modifiche a `main`.

**Criterio di accettazione:** l’esecuzione deve terminare verde su validazione config, startup stack, installazione/fixture, probe Auth/REST, build frontend, Playwright e cleanup. Qualunque errore è gate aperto; non si devono allegare log o artefatti di esecuzione se possono esporre chiavi. La workflow non esegue da sé push, PR, merge o deploy, e rifiuta il branch `main`.

## Risorse/costo e limiti

Il consumo massimo è un runner Linux standard fino a 45 minuti per singola esecuzione; il workflow ha un solo job e non carica artifact. Il runner effimero non conserva immagini Docker tra invocazioni e scaricherà le immagini necessarie; la cache npm riduce i download dei pacchetti applicativi. La durata effettiva va misurata alla prima esecuzione, non essendoci ancora un dato osservato. Per repository pubblici i runner standard GitHub-hosted sono gratuiti; per repository privati/interni il consumo attinge alla quota inclusa e poi può generare addebiti in base al piano e alla configurazione dell’account. Il costo monetario esatto non è deducibile da questo repository: consultare il pannello del proprietario e la [documentazione GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) prima dell’avvio.

Il test copre implementazioni locali self-hosted di GoTrue/PostgREST e non prova TLS, rete, configurazione/Auth managed, policy di progetto o limiti del servizio Supabase cloud. Non usa Garmin autorizzato/reale, dati Garmin o produzione. Il restore backup non è compreso nel nuovo gate E2E. Per la promozione possono rimanere gate separati di restore, revisione autorizzata e smoke managed staging, secondo la checklist già approvata.

## Interventi residui

1. Eseguire manualmente la workflow solo quando si autorizza un’esecuzione GitHub-hosted e osservare tutti gli step fino al cleanup.
2. Correggere eventuali incompatibilità rilevate prima di considerare concluso il gate; il presente incarico non autorizza a pubblicare il nuovo commit.
3. Tenere separata ogni verifica managed staging/Garmin e qualsiasi operazione di produzione, che non fanno parte di questo collaudo locale.

## Diagnosi del secondo fallimento E2E — 26 novembre 2026

Run esaminata: [45808291687](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45808291687), commit `0cb41de3b88c5d99bb68cfc828723e796535ff42`.

### Evidenze confermate

- Il log mostra esito positivo per la validazione della configurazione e la creazione della rete bridge dedicata.
- Il comando `supabase start` era racchiuso nello stesso script delle asserzioni sui container. L'output CLI era soppresso. Se il comando avesse restituito un codice non zero, lo script avrebbe stampato la diagnostica esplicita `Local Supabase stack startup failed`; tale messaggio non compare nel log. L'evidenza indica quindi che l'avvio ha restituito zero e che il fallimento è avvenuto in una verifica successiva nello stesso step.
- Il processo termina con codice 1 circa 18 secondi dopo l'inizio dello step. Poiché i controlli precedenti usavano `test`/`grep` con `set -e`, il log non distingue quale asserzione abbia fallito. Non è possibile attribuire con certezza quel codice a conteggio, tag, rete o binding senza una nuova esecuzione diagnostica.
- L'esame del sorgente della release CLI v3.4.0 conferma che `-x` è la lista dei servizi esclusi e che il flag `SUPABASE_USE_SLIM_IMAGES` abilita le immagini slim soltanto con valore `true` o `1`. I tag controllati corrispondono al manifest Dockerfile della release: PostgreSQL `17.12.0.002`, GoTrue `v2.198.0`, PostgREST `v16.6` e Kong `2.8.1`. Con Auth/API/DB abilitati, gli altri servizi elencati in `-x` e nella configurazione sono disabilitati/esclusi, il conteggio atteso resta quattro (DB, Auth, REST, Kong).

### Modifiche applicate per rendere attribuibile il prossimo errore

- Lo startup è ora uno step autonomo e non esegue controlli Docker successivi. Il suo output è conservato solo temporaneamente con permessi restrittivi, classificato con pattern non sensibili e cancellato prima di terminare; sui log GitHub vengono stampati soltanto fase, categoria e codice d'uscita. Non viene mai riversato output CLI integrale.
- `SUPABASE_USE_SLIM_IMAGES=false` è impostato esplicitamente sul comando di avvio, rendendo deterministica la corrispondenza tra il manifest upstream della CLI 3.4.0 e le verifiche dei tag.
- Inventario/stato container, tag immagini e isolamento rete/binding loopback sono step separati. Riportano conteggi e booleani e falliscono con categorie distinte (`container_count_mismatch`, `container_not_running`, `image_tag_mismatch`, `network_mismatch`, `port_binding_invalid`). Non stampano ID, riferimenti immagine, configurazioni, credenziali o payload.
- Il controllo delle porte continua a richiedere che ogni binding pubblicato sia `127.0.0.1`; la rete deve corrispondere all'ID creato per la run. Rimangono intatti il nome/identità DB, la fixture locale isolata, `staging_connection()`, il trigger limitato al branch e il cleanup `always()`.
- Non è stata dimostrata offline alcuna incompatibilità di `-x`, manifest, rete o numero container. Docker non è disponibile su questa macchina, quindi la nuova diagnostica non è stata esercitata su una stack reale e la causa puntuale tra le asserzioni post-start resta da confermare in una futura run GitHub autorizzata.

### Verifiche di questo intervento

Controlli eseguiti localmente sul worktree Windows:

| Controllo | Risultato |
| --- | --- |
| Actionlint sul workflow modificato | Superato |
| Python `unittest discover -s tests` | 27 test superati |
| PostgreSQL sintetico via `Invoke-V341Staging.ps1 -Task Local` | 17 test SQL superati; dump/restore isolato completato e cluster arrestato |
| Dashboard `test:load` | 5 superati |
| Dashboard `test:analytics` | 15 superati |
| Playwright desktop/mobile preesistente | 16 superati |
| Build TypeScript/Vite | Superata |
| `npm audit --audit-level=moderate` | 0 vulnerabilità |
| Gitleaks | Nessun segreto rilevato |
| `py_compile` dei moduli/test Python interessati e `git diff --check` | Superati |

Un tentativo iniziale di invocare la suite SQL direttamente, fuori dal runner che predispone il DSN e il cluster sintetico, è terminato senza eseguire test (`V34_TEST_DSN` assente); non è conteggiato come test fallito del prodotto. L'esecuzione successiva con il runner isolato è quella riportata sopra.

La run GitHub non è stata rilanciata; non è stato effettuato push, merge, deploy né accesso a servizi esterni. Docker non è disponibile localmente, quindi startup Supabase e nuove asserzioni runtime non sono state esercitate. Il gate E2E resta aperto fino a una run verde sul commit che contiene la diagnostica.

## Diagnosi del terzo fallimento E2E — 26 novembre 2026

Run: [45812444163](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45812444163), eseguita sul commit `1e5d40b43dc602ca40655f79d9c6367974cacb25`. Il log conferma config valida, rete dedicata creata, startup con exit code zero, e inventario di quattro container tutti running; il solo step fallito è il matching del tag PostgREST.

### Causa dimostrata

La versione immagine non è cambiata: la CLI v3.4.0 fissa nel [Dockerfile ufficiale](https://github.com/supabase/cli/blob/v3.4.0/apps/cli/src/shared/services/Dockerfile) l'upstream `postgrest/postgrest:v16.6`. La prima diagnosi aveva attribuito erroneamente a `setup-cli` l'export GHCR: il suo codice esporta `ghcr.io` solo per versioni CLI `>=1.28.0` e `<2.108.0`; la versione `3.4.0` è fuori da quell'intervallo. Non essendoci un override nel workflow, resta il default `public.ecr.aws` definito nel [resolver ufficiale della CLI](https://github.com/supabase/cli/blob/v3.4.0/apps/cli/src/command-internal/docker-registry.ts). Lo stesso resolver ricava il segmento finale dell'immagine upstream e costruisce il riferimento `public.ecr.aws/supabase/postgrest:v16.6`.

Il controllo precedente è stato corretto a `ghcr.io/supabase/postgrest:v16.6`, ma ha continuato a fallire nella run successiva. La causa effettiva è il registry atteso: riferimento PostgREST su GHCR non previsto dalla logica `setup-cli` per CLI 3.4.0. La versione `v16.6` e il matcher Bash non sono la causa.

### Correzione e protezioni

Il controllo PostgREST viene allineato al riferimento canonico ECR `public.ecr.aws/supabase/postgrest:v16.6` e confronta separatamente registry, repository e tag. La versione resta strettamente fissata. Per evitare ulteriori diagnosi per supposizione, prima del confronto vengono estratti i soli campi `.Config.Image` dei quattro container già identificati; ciascun riferimento viene stampato solo dopo validazione contro un'allowlist sintattica di registry, repository, tag e digest SHA-256. Un riferimento malformato è rifiutato senza stamparne il contenuto. Gli altri controlli container/rete/porte/DB e il cleanup `always()` restano invariati.

La run `45819381928` ha superato startup e inventario (4/4 container running) ma ha fallito sul confronto PostgREST `ghcr.io`. Non ha registrato il `.Config.Image` reale: il riferimento ECR è dimostrato dall'intera catena ufficiale e dalla configurazione workflow priva di override, ma sarà anche verificato e stampato in forma validata nella prossima run. In questa consegna non sono stati eseguiti push, PR, merge, deploy o accessi a servizi esterni.

### Verifiche locali della correzione

| Controllo | Esito |
| --- | --- |
| Actionlint | Superato |
| Python `unittest discover -s tests` | 27 superati, incluso controllo della allowlist e rifiuto di riferimenti arbitrari |
| PostgreSQL sintetico tramite task `Local` | 17 test SQL superati; backup/restore isolato completato, cluster arrestato |
| Dashboard Training Load | 5 superati |
| Dashboard Analytics/API | 15 superati |
| Playwright desktop/mobile | 16 superati |
| Build TypeScript/Vite | Superata |
| `npm audit --audit-level=moderate` | 0 vulnerabilità |
| `py_compile` e `git diff --check` | Superati |
| Gitleaks | Eseguito sui file in staging Git prima del commit |

Il test E2E con container Supabase non è disponibile su questa macchina senza Docker. La run remota successiva non è stata avviata.

## Correzione parser immagini Docker — quinta run E2E

Run [45836389449](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45836389449), commit remoto `5e723631ea8d1119eed2998c8f1f0b832f5cc003`. La diagnostica runtime ha registrato `public.ecr.aws/supabase/postgrest:v16.6` e componenti `registry_ok=true`, `repository_ok=false`, `tag_ok=true`; gli altri tre tag, startup e inventario 4/4 container erano superati.

La causa era il parsing Bash inline: `${ref_without_digest#*/}` rimuoveva soltanto il primo segmento `public.ecr.aws/`, lasciando `supabase/postgrest:v16.6`; il confronto richiedeva `supabase/postgrest`. Ho spostato parsing e funzioni di confronto in [`v341_docker_images.sh`](../tools/v341_docker_images.sh), che valida prima il riferimento con allowlist, poi separa registry, repository senza tag, tag e digest. Il workflow usa queste stesse funzioni e confronta esattamente registry `public.ecr.aws`, repository `supabase/postgrest`, tag `v16.6`. CLI e immagini non sono state cambiate.

Il test [`test_v341_docker_images.sh`](../tests/test_v341_docker_images.sh) importa ed esegue il parser Bash effettivamente usato dal workflow; copre il riferimento osservato, digest valido, tag/repository/registry errati, conteggio zero e duplicato, digest malformato, userinfo, whitespace e input con metacaratteri. La workflow esegue questo test subito dopo il checkout, prima di avviare la stack.

### Verifica preventiva del percorso successivo

La revisione statica non ha trovato errori certi nella verifica rete e binding (`NetworkID` esatto, tutti gli HostIp pubblicati su loopback), nel passaggio dei container ID via `GITHUB_ENV`, nell'identificazione Postgres tramite tag già convalidato, nella selezione delle sole `API_URL`, `DB_URL` e `ANON_KEY` dall'output env locale, né nella sequenza Auth/PostgREST/Playwright. I segreti CLI restano in memoria e le credenziali sintetiche sono passate al processo browser senza logging.

È stato invece corretto un difetto certo nel cleanup della rete: lo step salvava nome e ID Docker in `GITHUB_ENV` solo dopo il controllo d'identità; se quel controllo falliva, il cleanup non conosceva la rete appena creata. Ora le coordinate della rete vengono persistite immediatamente dopo `docker network create`, prima dell'ispezione. La verifica fail-closed resta identica e il cleanup rimuove la rete soltanto se driver, binding loopback ed etichetta corrispondono.

### Test della correzione

Il test Bash reale è stato eseguito localmente senza Docker tramite Bash for Windows: **17 asserzioni superate**, incluso il riferimento effettivamente osservato, e `bash -n` sui due script. Esiti completi della consegna:

| Verifica | Esito |
| --- | --- |
| actionlint | Superato |
| Python unit/regression | 27 superati |
| Bash parser (helper realmente usato dal workflow) | 17 superati |
| SQL su PostgreSQL sintetico con backup/restore isolato | 17 superati |
| Dashboard Training Load | 5 superati |
| Dashboard Analytics/API | 15 superati |
| Playwright desktop/mobile | 16 superati |
| Build dashboard | Superata |
| npm audit | 0 vulnerabilità |
| py_compile e diff whitespace | Superati |
| Gitleaks staged | Nessun segreto rilevato |

Il test Bash è inoltre un gate esplicito della workflow; l'E2E remoto non è stato rilanciato. L'ulteriore correzione di cleanup rete anticipa soltanto la persistenza dell'identità rete in `GITHUB_ENV`; test runtime di Docker non disponibili su questo host restano da confermare nel prossimo gate remoto.

## Sesta run E2E — avvio corretto dell'harness Python

La run [45839609226](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45839609226), sul commit remoto `1ee45b31f968578ffa44710dbb39b659a8d8b804`, ha superato il parser Docker, la configurazione Supabase CLI 3.4.0, l'avvio della stack, l'inventario 4/4, i tag delle immagini e le verifiche di rete/binding. È fallito soltanto lo step d'installazione SQL e probe Auth/REST, prima di qualsiasi connessione o modifica al database. Il log mostra il comando `python tools/local_supabase_e2e.py` e il traceback alla riga dell'import `from tools.staging_fixture import fixture_sql`, terminato con `ModuleNotFoundError: No module named 'tools'`. Il cleanup `always()` è poi riuscito.

La causa è la semantica di avvio di Python: eseguendo un file per percorso, `sys.path[0]` diventa la directory `tools/`; la directory radice del repository non è garantita come radice d'import e quindi il namespace `tools` non si risolve. La prova locale con l'interprete del progetto riproduce il fallimento per invocazione diretta (exit 1) e conferma che `python -m tools.local_supabase_e2e --help` dal root del repository risolve gli import ed esce 0 senza avviare servizi. La directory `tools` funziona come implicit namespace package: non serve aggiungere `__init__.py` o alterare il `sys.path` del programma.

Il workflow ora avvia il harness con `python -m tools.local_supabase_e2e`, mantenendo l'ambiente locale esplicito. È stato aggiunto un test di regressione che lancia il vero modulo con l'interprete corrente dal root del repository e verifica l'help prima di ogni accesso a servizi; il controllo statico del workflow richiede la forma `-m` e rifiuta quella per percorso. La revisione del passaggio successivo conferma che l'ID PostgreSQL e il system identifier sono raccolti nello stesso step, le credenziali CLI selezionate restano limitate ad API URL/DSN/anon key, i probe Auth/PostgREST e il test Playwright si avviano solo dopo l'import e l'installazione SQL, e il cleanup resta `always()`. Questi controlli applicativi non sono stati raggiunti nella run fallita.

Il fix è stato riprodotto localmente: invocazione diretta exit 1 con l'import error, invocazione `-m ... --help` exit 0. I risultati dei gate locali sono: Python 28 test superati; PostgreSQL sintetico 17 test SQL superati e backup/restore isolato completato; Training Load 5, Analytics/API 15 e Playwright desktop/mobile 16 superati; build dashboard superata; `npm audit --audit-level=moderate` senza vulnerabilità; actionlint, `bash -n`, parser immagini Bash (17 asserzioni) e `py_compile` superati. La discovery Playwright live ha elencato 1 test usando esclusivamente URL/key/account placeholder sintetici e `--list`, senza avviare il server; il test live con Supabase non è stato eseguito localmente perché non è disponibile la stack Docker effimera. Gitleaks e `git diff --check` sono verificati prima del commit.

Non sono stati eseguiti push o una nuova run remota: il gate Auth/PostgREST/Playwright effettivo resta aperto fino a una pubblicazione e run autorizzate.

### Settima run — primo errore applicativo osservato e diagnostica protetta

La run [45842755990](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45842755990), sul commit `541b62f2cbfd5509323fc691f20b1d626f158cfd`, ha superato il parser immagini, avvio Supabase, container 4/4, immagini fissate, rete loopback, installazione SQL/fixture, autenticazione sintetica, RPC legacy/V2, ACL, paginazione e revisione. Il cleanup è riuscito. È fallito il solo test browser live: il processo ha exit code 1 e l'harness riportava un messaggio generico, scartando l'intero output Playwright per evitare di registrare contesto potenzialmente sensibile. Quindi l'errore osservato è reale ma la causa applicativa specifica non è ancora dimostrabile dai log disponibili; non viene attribuito arbitrariamente a dashboard, API o test.

Per la prossima run, l'harness aggiunge una diagnostica a allowlist: categoria limitata (timeout, setup browser, connessione preview/API, asserzione o errore Playwright non classificato), identificazione del test E2E statico, linea sorgente e matcher scelto da un insieme fisso. Non stampa output Playwright grezzo né contenuti variabili. Il test di regressione inserisce nel log sintetico una password e una stringa JWT e verifica che il riepilogo esponga soltanto i campi consentiti. Nessuna logica applicativa o asserzione E2E è stata modificata; il test di integrazione resta reale.

La run successiva [45843723586](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45843723586), sul commit `3b36ee40086066be8a7d1fb29f8508e3d5e5aadb`, ha confermato di nuovo che il solo fallimento rimane il test dashboard live: il riepilogo sicuro ha classificato un timeout su `toBeVisible`, ma ha indicato la riga 11, cioè la dichiarazione del test. Anche la run [45844463017](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45844463017), sul commit `a395302a73062684a5ec805905cf89387b9d1f21`, ha restituito la stessa linea. Questo dimostra che il reporter testuale configurato non fornisce al parser una posizione del frame fallito. Nella versione Playwright 1.65.1 fissata, il reporter JSON serializza `errorLocation` separatamente dalla posizione della dichiarazione: il workflow locale usa ora `--reporter=json` (output sempre catturato) e l'harness ricava la posizione esclusivamente dal campo strutturato `errorLocation`. La regressione sintetica copre un risultato `timedOut`, la differenza tra linea dichiarativa e frame dell'asserzione e l'omissione di password/JWT presenti nel report. La causa funzionale del timeout resta aperta fino alla prossima run; non viene fatta alcuna modifica speculativa a dashboard o test E2E.

La run [45846028051](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45846028051), sul commit `ef2e8854d6f180cb42e126f5bacf741cfd8f59de`, ha confermato SQL/Auth/REST e cleanup superati ma ha prodotto `playwright_report_unclassified`. Il sorgente Playwright 1.65.1 chiarisce che il titolo del test è serializzato su `spec.title`, mentre `spec.tests[]` contiene i risultati senza il titolo ripetuto; l'harness cercava erroneamente il titolo nel livello interno. La correzione segue la struttura effettiva del reporter e il test sintetico ora riproduce la forma JSON reale (inclusi `file`/`line` della spec e `errorLocation` del risultato). La causa del timeout browser resta quindi non ancora diagnosticata; non è stato modificato il comportamento dell'applicazione.

## Diagnosi cambio account — run 45846744068

La run [45846744068](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45846744068) ha superato i gate SQL/Auth/API e ha fallito il test browser live in `dashboard/tests/supabase.integration.spec.ts:37`, subito dopo il login dell'utente sintetico escluso dall'allowlist. L'asserzione attendeva il titolo della panoramica `La tua performance`.

### Causa dimostrata del fallimento E2E

La sequenza del test seleziona `Qualità dei dati` per l'utente autorizzato, poi esegue logout e login con l'utente negato. In `dashboard/src/main.tsx`, `section` è stato di navigazione indipendente dall'identità: il cambio di sessione invalida risultati, ricerca, offset temporale, errore e progress, ma non resetta la sezione corrente. Perciò il secondo account viene renderizzato correttamente nella sezione ancora selezionata, `Qualità dei dati`; l'asserzione sulla panoramica era falsa. L'autenticazione non fallisce: l'interfaccia resta autenticata, le RPC protette vengono rifiutate e compare `Accesso negato all’archivio.`. Il test è stato corretto per verificare la sezione mantenuta e l'assenza di dati. Il successivo login autorizzato nella stessa sezione verifica il ripristino dei dati.

La sequenza è stata riprodotta localmente nel test Playwright di regressione sul componente e sul client Supabase JS effettivi, con endpoint HTTP sintetici controllati: autorizzato → logout → negato → RPC 403 senza righe → logout → autorizzato → lettura nuovamente consentita. L'asserzione sulla panoramica fallisce nello scenario in cui la navigazione è rimasta su Qualità, mentre quella coerente con la navigazione reale passa. Nessuna condizione speciale per Playwright è stata aggiunta all'applicazione.

### Difetto reale separato: errore del logout remoto

L'analisi del client Auth effettivamente installato (`@supabase/auth-js` 2.119.2) e la sua documentazione di migrazione confermano che `signOut()` con scope predefinito/global, se la revoca remota fallisce, può restituire errore mantenendo la sessione locale e senza emettere `SIGNED_OUT`. L'applicazione invece aveva già mostrato la schermata login in React. Questo causava divergenza: al reload la sessione persistita autenticava nuovamente l'utente e i suoi dati potevano riapparire.

Il difetto è stato riprodotto prima della correzione con una risposta sintetica HTTP 400 alla revoca: dopo il logout appariva la schermata login, ma dopo reload veniva ripristinata la sessione precedente. La correzione usa `supabase.auth.signOut({ scope: 'local' })`, che revoca localmente la sessione e notifica l'app anche se la revoca remota non riesce. L'interfaccia conserva l'avviso `Disconnessione remota non confermata`; non dichiara riuscita la revoca degli altri dispositivi. La regressione verifica logout, errore remoto, reload e assenza dei dati precedenti.

### Regressioni e limiti di verifica

I test Playwright locali usano il componente, il client Supabase JS e richieste HTTP intercettate verso endpoint sintetici; coprono autenticazione valida, esclusione allowlist, credenziali non valide, risposta Auth ritardata, transizioni fra account, richieste dati obsolete e errore remoto di logout. Sono test realistici della logica client ma non sostituiscono il gate integrato con i servizi Supabase reali.

Docker e Supabase CLI non sono disponibili sull'host Windows: la run live con Auth/PostgREST locali non è stata riprodotta qui. Nessun nuovo E2E remoto è stato avviato. Restano da verificare sul runner effimero la sequenza browser integrata aggiornata e la reale interazione di logout con GoTrue. La run 45846744068 rimane fallita; il gate E2E non è dichiarato verde.

### Verifiche locali della diagnosi

| Verifica | Risultato |
| --- | --- |
| Playwright dashboard desktop/mobile, `npm run test:charts` con Node 22.23.5 | 26 superati |
| Regressioni Auth/sessione mirate desktop | 6 superate |
| Python `unittest discover` nell'ambiente virtuale del repository | 29 superati |
| Training Load | 5 superati |
| Analytics/API | 15 superati |
| Build TypeScript/Vite | Superata |
| `npm audit --audit-level=moderate` | 0 vulnerabilità |
| Actionlint | Superato |
| Gitleaks sull'intero repository | Nessun leak rilevato |
| `git diff --check` | Superato |

Un primo run Playwright sovrapposto a un secondo avvio locale ha avuto un errore `ENOENT` sull'artifact di trace; il secondo avvio ha rilevato la preview già in uso. Dopo aver lasciato terminare il processo e aver eseguito Playwright in modo isolato, l'intera matrice desktop/mobile è passata (26/26). Non si attribuisce quindi quel primo errore al codice. SQL/backup-restore e integrazione live Supabase non sono stati rieseguiti: Docker e CLI non sono disponibili localmente e non è autorizzato avviare una nuova run remota.
