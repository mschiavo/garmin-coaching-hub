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
