# Garmin Coaching Hub V4.0 — Report Sprint 01

## Esito

Implementata la base visuale V4.0 sul branch `feature/v4-visual-foundation`, a partire dal commit previsto `8fda8bbf84bc40f191fdfee32ec5d6a374044454`. Nessuna modifica è stata apportata a `main`, al worktree V3.4.1, ai contratti Auth/Supabase/Garmin, agli schemi SQL o alle policy. Non sono stati eseguiti push, merge o deploy.

La pulizia del repository non ha rimosso file: nessun candidato ha soddisfatto contemporaneamente i criteri di inutilizzo dimostrato, assenza di riferimenti e assenza da flussi supportati o necessari alla riproducibilità.

## Audit e conservazione

L'inventario ha incluso i file tracciati e i riferimenti in sorgenti/import, test, `package.json`, workflow GitHub Actions, configurazione dashboard, SQL, script operativi e documentazione.

**File rimossi: nessuno.**

Sono stati conservati, pur essendo legati a release precedenti o non importati dal frontend:

- `README-BETA.md`, `README-V3.1.4.md`, `README-V3.txt` e i documenti storici `docs/V3_*`: conservano istruzioni, decisioni e comportamento delle release mantenute.
- `tools/apply_community_v21.py`, `tools/apply_v3_training_load.py` e gli script `tools/apply_v31*`: sono procedure operative di migrazione/aggiornamento e sono documentati storicamente; l'assenza di import frontend non ne dimostra l'abbandono.
- `supabase/bootstrap.sql`, `supabase/dashboard.sql`, migrazioni `0034`/`0035`, fixture e test SQL: fanno parte della riproducibilità e delle verifiche d'integrità.
- `dashboard/tests/fixture.html` e `fixture.tsx`: sono usati dai test Playwright dei grafici.
- `react-is`: non è importato dal codice applicativo, ma `npm ls react-is --depth=1` ne mostra l'uso da parte di Recharts 3.11.0; rimuoverlo senza valutare l'effetto sul vincolo di versione sarebbe una modifica dipendenze non necessaria.

Output come `dashboard/node_modules`, `dashboard/dist`, `dashboard/test-results` e cache TypeScript/Python sono generati e ignorati da Git. Non sono state eseguite pulizie esterne al worktree e non sono stati rimossi file ignorati.

## Architettura e interfaccia implementate

- `dashboard/src/v4-design-system.css` definisce palette, token semantici, varianti dark/light, focus visibile, dimensioni minime dei controlli e regola `prefers-reduced-motion`. Il foglio è importato dal foglio condiviso `style.css`, affinché dashboard, grafici e fixture abbiano gli stessi token.
- `dashboard/src/components/v4/ThemeProvider.tsx` fornisce tema dark predefinito, alternanza dark/light e persistenza limitata alla preferenza `gch-dashboard-theme` in `localStorage`.
- `AppShell.tsx` incapsula la navigazione preesistente con shell responsive, stato di navigazione semantico, refresh, cambio tema e logout. Le voci Planning, Goal Center e Performance Lab sono marcate come anteprime.
- `MetricCard.tsx` e `formatMetric.ts` mostrano unità, finestra, provenienza e stato; i valori mancanti/non finiti sono resi come `—`, mai come zero implicito.
- `ProgressRing.tsx` valida misura, unità e target; target nullo/non positivo o dati mancanti non producono una percentuale. Il progresso oltre il target mostra il valore effettivo e l'eccedenza, mantenendo l'arco limitato a un giro.
- `DataState.tsx` espone stati loading, empty, partial, denied, error, stale e available, con annunci appropriati per caricamento/errore/accesso negato.
- `ChartPanel.tsx` fornisce intestazione, unità, stato del dato e alternativa tabellare; `EvidenceTooltip.tsx` presenta fonte, metodo, periodo, campioni e limiti in un elemento accessibile da tastiera.
- Il dashboard esistente mantiene navigazione e sezioni V3.4.1. Le metriche KPI ora passano per il componente condiviso; i colori dei grafici usano i token centrali.
- Planning e Goal Center non persistono né scrivono dati. Il solo allenamento d'esempio e il ring 28/40 km sono etichettati esplicitamente come dimostrativi. Performance Lab non inventa VO₂max o VDOT e li mostra come mancanti finché fonti, unità e metodi non sono verificati.

Le anteprime non aggiungono chiamate API o nuove persistenze; le schermate reali continuano a usare gli archivi già esposti dalle RPC correnti. Le funzioni e gli effetti Auth/sessione non sono stati modificati.

## Difetti emersi e correzioni

1. L'aggiunta delle tre voci di anteprima allungava la navigazione: a viewport intermedi il footer della sidebar, incluso logout, poteva uscire dall'area visibile. La navigazione ora scorre nel proprio spazio; il footer resta fisso nel layout desktop/tablet e su mobile è disponibile il pulsante logout della barra superiore. È stato aggiunto un controllo Playwright della raggiungibilità del logout tra 360 e 1440 px.
2. La shell aveva cambiato il nome accessibile del refresh e quindi rotto selettori e contratto d'interazione preesistenti. È stato ripristinato il nome “Aggiorna”; durante il caricamento viene esposto “Aggiornamento in corso”.
3. Le fixture dei grafici importavano `style.css` senza il nuovo foglio token. In quel percorso il colore SVG risolveva a `stroke: none`, con grafici non corretti. I token sono ora importati dal foglio condiviso. Verifica browser: il riferimento ambra risolve a `rgb(255, 198, 109)`.
4. Il titolo iniziale “La tua performance.” era stato sostituito senza necessità; è stato ripristinato per mantenere il contenuto preesistente.
5. Alcuni locator dei nuovi test erano ambigui perché titoli e unità ricorrono in più componenti. Sono stati circoscritti al componente/heading esatto. Il test di navigazione attende anche il completamento della paginazione sintetica prima di confrontare il numero di richieste, evitando di confondere le richieste iniziali ancora in corso con chiamate causate dalla navigazione.

Queste modifiche non alterano contratti Auth/API né usano condizioni speciali per l'ambiente di test.

## Verifiche eseguite

| Controllo | Esito |
|---|---|
| `npm run test:charts -- --reporter=line` | **Superato: 42/42**, un worker, browser Chromium desktop e mobile. Include test grafici esistenti, autorizzazione Auth sintetica, login/logout, transizione account autorizzato→negato→autorizzato, risposta Auth asincrona, logout remoto fallito, richieste tardive, anteprime senza chiamate aggiuntive, dimensioni richieste, zoom 200%, focus e reduced motion. |
| Test Training Load con Node 22: `npm exec --yes --package=node@22 -- node --test tests/training-load.test.mjs` | **Superato: 5/5**. |
| Test Analytics/API con Node 22: `npm exec --yes --package=node@22 -- node --test tests/analytics.test.mjs tests/data-api.test.mjs` | **Superato: 15/15**. Node 22.23.5 è stato ottenuto nell'area cache npm di `npm exec`, senza modificare manifest/lockfile né installazione di sistema. |
| `npm run build` | **Superato**: TypeScript `tsc -b` e Vite production build; 2054 moduli trasformati. |
| `npm audit --audit-level=moderate` | **Superato**: zero vulnerabilità segnalate. |
| `python -m py_compile` su file Python tracciati | **Superato: 23 file**. |
| `python -m unittest discover -s tests -v` | **Parziale**: 3 test community superati; 4 moduli non importabili perché `psycopg` non è installato (`ModuleNotFoundError`). Nessun pacchetto Python è stato installato. |
| `git diff --check` | **Superato**, nessun errore whitespace. Git segnala soltanto la normalizzazione CRLF/LF di `style.css` al prossimo aggiornamento dell'indice. |

I comandi `npm run test:load` e `npm run test:analytics` eseguiti con il Node predefinito 20.10.0 non supportavano l'import TypeScript diretto (`ERR_UNKNOWN_FILE_EXTENSION`). Gli stessi test sono poi stati eseguiti e superati con Node 22.23.5 come sopra. Il progetto richiede Node >=22 e `.nvmrc` indica 22.

## Verifiche non eseguite e limiti

- **PostgreSQL/SQL, backup/restore e Supabase Auth/PostgREST live:** non eseguiti. Sul PC non sono disponibili Docker, `psql`, `postgres` o Supabase CLI. I test browser Auth usano un server HTTP sintetico intercettato dal test harness e non equivalgono a un'integrazione con lo stack Supabase reale.
- **Garmin e Supabase cloud:** nessun accesso effettuato; nessun dato o credenziale reale usati.
- **Python unit test che richiedono PostgreSQL:** non eseguiti oltre ai tentativi riportati; dipendenza `psycopg` assente e nessun database locale disponibile.
- **Actionlint e Gitleaks:** eseguibili non presenti nel PATH/cache locale. Non sono stati modificati workflow o segreti; questi audit non sono dichiarati superati.
- **Accessibilità assistiva completa:** non era disponibile una suite automatica axe/screen reader. Sono verificati ruoli/nomi accessibili, focus da tastiera, contrasto visivo tramite palette, target 44 px e reduced motion; non sono una sostituzione della verifica con tecnologie assistive reali.
- I test E2E live che usano servizi reali restano da eseguire nell'ambiente d'integrazione appropriato. I test locali sintetici non sono presentati come gate Supabase completato.

## Avvio e visualizzazione locale

### Fixture visuale V4 senza servizi

```powershell
Set-Location D:\Repository\garmin-coaching-hub-v4\dashboard
npm ci
npm run dev -- --host 127.0.0.1
```

Aprire `http://127.0.0.1:5173/tests/v4-fixture.html` per visualizzare MetricCard, ProgressRing, stati, pannello grafico/tabella e cambio tema con dati esclusivamente sintetici.

### Dashboard completa

Con lo stesso server aprire `http://127.0.0.1:5173/`. Per autenticarsi e vedere l'app completa, predisporre prima un `.env.local` non tracciato con endpoint e chiave **publishable/anon** di un ambiente locale o staging autorizzato. Non usare service-role key, segreti di produzione o credenziali Garmin. Senza configurazione valida l'app mostra lo stato di configurazione e non tenta login. Le anteprime Planning/Goal Center/Performance diventano raggiungibili dopo l'autenticazione; i dati dimostrativi sono marcati nell'interfaccia.

## Commit e stato Git

Non è stato creato un commit di pulizia perché non è stato eliminato alcun file. Il commit locale Sprint 01 include interfaccia, regressioni e questo report. Nessun push o modifica di riferimenti remoti è stato eseguito. Lo SHA e la pulizia finale del worktree sono riportati nel messaggio di consegna.
