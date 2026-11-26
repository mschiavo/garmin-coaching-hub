# Report operativo V3.4.1

## Stato della release

Il branch remoto `feature/v341-staging-reliability` punta a `5585a6d91b89294c7279db3deca1cdad32a4b82a`. Sullo SHA esatto il workflow Community Edition Checks è completato con **success** per Dashboard, Python e PostgreSQL. La correzione del job SQL è quindi verificata sulla CI pubblicata. Il commit operativo locale si identifica con `git log -1 --format=%H -- docs/V3_4_1_OPERATIONS_REPORT.md`. Contiene strumenti, documentazione e test. [Run CI 45420528188](https://github.com/mschiavo/garmin-coaching-hub/actions/runs/45420528188)

I riferimenti protetti locali e remoti coincidono con l’inventario di implementazione. Anche oggetto e commit del tag coincidono.

| Riferimento | SHA |
| --- | --- |
| main | `58df16989f8d781672dc6b5278efb91a7187bed4` |
| Community Beta | `3a363ab29cba4e97fa46dc39dbf1405af856252a` |
| V3.2 | `ba30c08b7ecd8836b7a3492a6f183fa7c93ac52c` |
| V3.3 | `f117f98073a4544b4099c5483ef0514ec3132d72` |
| V3.4 | `5b1700b892a6f6b3b29e22326978d42f0504982d` |
| Oggetto tag v3.1.5-beta.1 | `a402cdd7e8868a92d7fc86e8aaa81f1492f6ffeb` |
| Commit del tag | `3a363ab29cba4e97fa46dc39dbf1405af856252a` |

## Strumenti e prove locali

PowerShell 7.6.10, Node 22.23.5 tramite fnm, Python 3.12.16 nell’ambiente locale, PostgreSQL 17.9 con `initdb`, `pg_ctl`, `psql`, `pg_dump` e `pg_restore`, Chromium e Gitleaks 8.30.1 sono disponibili. Usare i parametri `-PgBin`, `-Python` e `-Node` quando il PATH seleziona una versione diversa.

| Verifica | Risultato |
| --- | --- |
| Suite di regressione e test nuovi | 71 passati. Training Load 5, Analytics/API 15, Chromium 16, Python 18, PostgreSQL 17 |
| Build e compilazione Python | Superate. Chunk maggiore 393,56 kB |
| Audit e controlli Git | Zero vulnerabilità npm. Whitespace e Gitleaks sul diff staged superati |
| Staging `Plan` e guardia cloud | Il piano si esegue offline. Una chiamata cloud senza approvazione viene rifiutata prima di avviare il client |
| Staging `Local` | Suite SQL, dump custom, TOC, restore e confronto. Origine e ripristino coincidono per 2.503 attività, 2.501 giornate, 6 evidenze, 1 riga allowlist, date, funzioni, proprietari, ACL e hash delle risposte RPC |
| Staging `Restore` | Percorso autonomo verificato con dump sintetico e TOC revisionata in un nuovo cluster locale |
| Pulizia worktree | Dry-run verificato su entrambi i worktree |

Lo script di staging è [Invoke-V341Staging.ps1](../tools/Invoke-V341Staging.ps1). Senza parametri mostra il piano. Il task `Local` crea il cluster loopback in una directory nuova sotto `.cache/`, esegue le prove SQL e confronta il dump ripristinato in un secondo database. `Restore` crea un cluster separato, installa lo stub Auth e adatta localmente l’ownership al ruolo di ripristino. I backup cloud mantengono le definizioni applicative nel dump ed escludono dati di allowlist e marker. Review della TOC, mappatura degli eventuali ruoli gestiti e convalida del servizio Auth rimangono parte del collaudo.

```powershell
pwsh -NoProfile -File tools/Invoke-V341Staging.ps1
pwsh -NoProfile -File tools/Invoke-V341Staging.ps1 -Task Local -PgBin <bin-postgres> -Python <python-3.12>
pwsh -NoProfile -File tools/Remove-V341LegacyWorktree.ps1
```

## Inventario worktree e condizioni per la pulizia

| Worktree | HEAD | Stato |
| --- | --- | --- |
| `D:\Repository\garmin-coaching-hub-v32` | `ba30c08` | Pulito, ref remoto verificato, zero processi con percorso esplicito |
| `D:\Repository\garmin-coaching-hub-v33` | `f117f98` | Pulito, ref remoto verificato, zero processi con percorso esplicito |

Entrambi contengono `dashboard/test-results/` da valutare per conservazione selettiva e le directory rigenerabili `node_modules/`, `dist/`, `__pycache__/`, oltre a `tsconfig.tsbuildinfo`. Git non ha rilevato ulteriori ignorati. Il controllo processi confronta percorsi espliciti, quindi terminali con working directory implicita e schede IDE richiedono conferma manuale. Lo script [Remove-V341LegacyWorktree.ps1](../tools/Remove-V341LegacyWorktree.ps1) usa dry-run predefinito. La rimozione richiede un singolo target, attestazione dei processi chiusi, ref remoto esatto, stato pulito e assenza di ignorati. Usa `git worktree remove` senza force.

## Checklist unica per l’operatore

- [ ] **Staging** — Approvare le singole operazioni cloud e predisporre il progetto separato e due account Auth sintetici. Registrare i due ref indipendentemente e caricare le sole credenziali di staging nella shell dedicata secondo il runbook. Per un progetto vuoto creare prima lo schema `dashboard_private` con `CREATE SCHEMA IF NOT EXISTS dashboard_private;`, poi il marker del runbook. Per gli upgrade usare archivi sintetici V3.3 e V3.4 separati, con marker. [Runbook, progetto e Auth](V3_4_1_STAGING_RUNBOOK.md#1-progetto-auth-e-destinazione)
- [ ] **SQL, backup e restore** — Eseguire `Verify` prima del collaudo. Per un upgrade fermare i writer e usare `Snapshot` e `Backup` prima di `Install -Mode Upgrade33` o `Upgrade34`. Revisionare la TOC, escludere gli oggetti estranei e l’identità sorgente, poi eseguire `Restore -DumpFile <file> -ReviewedToc <file>` solo sul cluster isolato creato dallo script. Verificare esiti, ACL e differenze di ownership prima di procedere. Per il fresh install usare `Install -Mode Fresh`; al termine configurare manualmente l’allowlist e verificare la cache PostgREST. I file SQL vengono applicati in sequenza, ciascuno con le proprie regole transazionali. Se un file si interrompe, ispezionare con `Snapshot` o query del runbook prima di riprendere. [Runbook SQL](V3_4_1_STAGING_RUNBOOK.md#2-installazione-e-upgrade)
- [ ] **Fixture, REST e browser** — Applicare `Fixture -Size large` sul fresh install vuoto. Usare `-Legacy` prima dell’upgrade su un archivio adatto e omettere le asserzioni di quantità fresh eseguendo `Probe` con il corretto `-Mode`. Avviare `Dashboard` dopo `Probe`; Vite richiede le dipendenze installate con `npm ci` e una directory dashboard priva di file `.env` privati. Verificare UI, login/logout e viewport 1440/375/390 px. L’opzione `-VerifyRevisionChange` attende la mutazione sintetica manuale approvata descritta nel runbook. [Runbook REST e dashboard](V3_4_1_STAGING_RUNBOOK.md#3-rest-e-auth)
- [ ] **Pulizia** — Decidere se conservare `test-results` di V3.2 e V3.3. Chiudere IDE, terminali e server che usano le cartelle e gestire selettivamente i file ignorati. Rieseguire il dry-run. Solo su approvazione eseguire `-Remove -Target V32 -ConfirmClosed` o `-Remove -Target V33 -ConfirmClosed`, uno per volta.
- [ ] **Approvazioni successive** — Decidere se pubblicare il commit operativo locale e osservarne la CI sullo SHA esatto. Il gate Supabase resta aperto fino al collaudo su progetto dedicato. Il gate Garmin resta aperto fino a una prova distinta con dati autorizzati per 1–3 giorni chiusi. Valutare la produzione dopo entrambi i gate.

Per ogni task cloud usare PowerShell 7 con autorizzazione esplicita. Il ref passato è quello di staging verificato dall’operatore. Il helper ricontrolla ref, provenienza del DSN diretto, TLS e marker prima delle operazioni.

```powershell
$auth = @{ ApproveCloud = $true; ApprovedProjectRef = $env:GCH_STAGING_PROJECT_REF }
& ./tools/Invoke-V341Staging.ps1 -Task Verify @auth
```

Durante questa sessione le operazioni remote si sono limitate alle letture Git e GitHub. Zero push, merge, deploy, accessi a Supabase cloud o Garmin reale, modifiche alla produzione e rimozioni di worktree.

## Addendum — harness GitHub E2E locale

Il branch di lavoro contiene ora un workflow manuale dedicato [v341-local-supabase-e2e.yml](../.github/workflows/v341-local-supabase-e2e.yml), un probe locale isolato [`local_supabase_e2e.py`](../tools/local_supabase_e2e.py) e il test browser reale [`supabase.integration.spec.ts`](../dashboard/tests/supabase.integration.spec.ts). Questa implementazione non sostituisce i controlli di `staging_connection()` e non è stata pubblicata né eseguita remotamente. I controlli locali riportano 25 test Python, 17 test SQL PostgreSQL 17.9, 36 test dashboard, build e npm audit verde. Il gate E2E live resta aperto. Il dettaglio operativo è nel [report di collaudo E2E](V3_4_1_E2E_REPORT.md).
