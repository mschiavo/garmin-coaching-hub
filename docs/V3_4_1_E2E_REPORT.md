# Report operativo — collaudo E2E V3.4.1

**Data:** 26 novembre 2026
**Branch:** `feature/v341-staging-reliability`
**Worktree:** `D:\Repository\garmin-coaching-hub-dev`

## Implementazione

È stato aggiunto [`v341-local-supabase-e2e.yml`](../.github/workflows/v341-local-supabase-e2e.yml), eseguibile prima del merge da un trigger `push` temporaneo limitato al branch `feature/v341-staging-reliability` e ai file del workflow, harness, SQL, dipendenze, dashboard e test interessati. `workflow_dispatch` resta disponibile per usi successivi, ma GitHub lo abilita solo quando la definizione è presente sul branch predefinito: non è il metodo di avvio per questo pre-merge gate. Il runner GitHub-hosted Linux `ubuntu-24.04` è effimero. La workflow ha `contents: read`, checkout senza credenziali persistenti, action con SHA completi, Python 3.12.8, Node 22.23.5 e Supabase CLI 3.4.0. Avvia la stack tramite CLI senza `supabase link`, esclude i servizi non richiesti e pinna i container Postgres `17.6.1.136`, GoTrue `v2.198.0`, PostgREST `v14.18` e Kong `3.9.5`; le versioni sono elencate dalle note CLI e dal manifesto immagini Supabase ufficiale ([CLI 3.4.0](https://github.com/supabase/cli/releases/tag/v3.4.0), [Docker versions](https://github.com/supabase/supabase/blob/master/docker/versions.md)). Il runner non ha ambienti o secrets associati alla workflow; i riferimenti `secrets.*` sono assenti.

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
