# Garmin Coaching Hub V4.0 — Sprint 01B Visual Fidelity

**Stato:** implementazione locale completata; nessun push, merge o deploy.
**Branch:** `feature/v4-visual-foundation`
**Base verificata:** `cede2d135665df457f0f5e243982b6abce98bba8` (Sprint 01).

## Diagnosi della distanza dai mockup

I sei riferimenti in `D:\Repository\garmin-v4-planning\mockup` sono stati esaminati. `01_dashboard_desktop.png` rappresenta la composizione Home; `03_performance_recovery_desktop.png` approfondisce le aree Performance e Recovery; `05_progressi_settimanali.png` è il riferimento per il riepilogo e i grafici di volume. I mockup `02_planning_desktop.png`, `04_goal_center.png` e `06_performance_metriche_derivate.png` raffigurano aree più ampie o funzionalità successive: non sono stati usati per inventare schermate operative o misure non disponibili.

La fixture originaria (`tests/v4-fixture.html`) era un catalogo di card isolate. La dashboard autentica aveva già una shell e analisi reali, ma la Home componeva un grande hero, card KPI senza una gerarchia compatta, grafici separati e non offriva insieme una vista recenti attività/capacità dati. La fixture quindi amplificava la distanza, ma la composizione della Home era anch'essa incompleta rispetto al mockup. È stata mantenuta come catalogo e affiancata da una pagina preview completa.

## Implementazione

- Home completa in griglia: quattro KPI, volume settimanale, riepilogo degli ultimi sette giorni, progresso con ring solo se il target è valido, performance osservata, segnali Recovery, attività recenti e copertura archivio.
- Il calcolo usa esclusivamente `ActivityRow`, `DailyRow`, `LoadPoint` e la copertura già restituita/calcolata dalla dashboard. Il volume resta descrittivo; non sono stati introdotti score fisiologici o nuove metriche stimate.
- Un giorno senza corse è disegnato come zero solo quando `covered()` conferma la copertura giornaliera. Nei giorni non verificati compare un indicatore `?` con trama distinta.
- La Home reale riusa i dati e lo stato già caricati da `main.tsx`; non sono state aggiunte chiamate o modificati Auth, RPC, ingestion Garmin o persistenza.
- La preview `/tests/v4-dashboard-preview.html` monta la stessa Home e shell con fixture locale dichiaratamente sintetica. Non importa il client Supabase e non chiama Supabase o Garmin. Consente anche di provare il tema chiaro, la navigazione touch e il ritorno alla Home.
- `AppShell` accetta slot di header/footer e modalità preview, mantenendo i default precedenti per gli altri chiamanti.
- La fixture catalogo organizza KPI e ring su una griglia naturale, invece di presentarli in una colonna indefinita.
- Nessuna dipendenza npm, migrazione SQL o asset remoto è stato aggiunto.

## Confronto visuale

La preview riprende il linguaggio dei mockup approvati: sidebar scura persistente, superfici blu stratificate, bordi sottili, accenti per funzione, header sintetico con periodo/atleta demo, quattro KPI in una riga desktop, grafico dominante e scheda settimanale affiancata, poi Performance/Recovery e attività/copertura. Su tablet la griglia principale passa a una colonna; su mobile KPI in due colonne, navigazione orizzontale touch, grafici e ring ridimensionati e tabelle con scorrimento interno.

Rimangono differenze deliberate: non è stata riprodotta l'immagine illustrativa del mockup; l'identità atleta è una badge sintetica nella preview e non è dedotta dall'autenticazione; i colori dei grafici seguono il tema semantico; Recovery espone campioni e serie osservate senza interpretazioni cliniche. Le pagine Planning, Goal Center e Performance Lab complete dei mockup non sono state implementate in questo sprint.

## Screenshot acquisiti con Playwright

File in `dashboard/test-results/v4-visual-preview/` (directory ignorata da Git). I PNG senza suffisso `-full` hanno la viewport esatta richiesta; i file `-full` mostrano l'intera pagina scorrevole.

- `home-1440x900.png` e `home-1440x900-full.png`
- `home-1440x900-light.png` (tema chiaro, viewport desktop)
- `home-1920x1080.png` e `home-1920x1080-full.png`
- `home-768x1024.png` e `home-768x1024-full.png`
- `home-390x844.png` e `home-390x844-full.png`

Playwright ha verificato in queste dimensioni la presenza delle sei aree Home, l'assenza di overflow orizzontale globale e l'assenza di richieste verso host Supabase/Garmin. È stato controllato anche il viewport 720×450, rappresentativo dell'area CSS visibile a zoom 200% su un viewport desktop 1440×900. Un test separato prova la navigazione mobile e il rientro alla Home.

## Verifiche

| Verifica | Esito |
|---|---:|
| `npm run build` (TypeScript + Vite) | Superata |
| `npm run test:charts -- --reporter=line` | 44 superati, 2 skip attesi (46 casi/progetti) |
| Test Playwright Auth, allowlist, cambio account, logout, richieste tardive | Inclusi nella suite: superati nei progetti desktop e mobile |
| Preview responsive e screenshot | Superata: viewport desktop, desktop largo, tablet e mobile; tema chiaro acquisito |
| `npm exec --yes --package=node@22 -- node --test tests/training-load.test.mjs` | 5 superati |
| `npm exec --yes --package=node@22 -- node --test tests/analytics.test.mjs tests/data-api.test.mjs` | 15 superati |
| `npm audit --audit-level=moderate` | Superata, 0 vulnerabilità |

Il comando unitario diretto con Node locale 20.10.0 fallisce perché Node 20 non carica i moduli `.ts` importati dal test; il progetto dichiara Node `>=22`. Rieseguito con Node 22.23.5 tramite `npm exec`, i 20 test unitari sono passati. La suite Playwright disponibile è sintetica: copre regressioni Auth con risposte simulate, ma non sostituisce un collaudo Supabase Auth/PostgREST live. Non è stata richiesta né effettuata una sessione Docker/Supabase reale in questo sprint.

## Preview locale

Da `D:\Repository\garmin-coaching-hub-v4\dashboard`:

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 4179
```

Aprire `http://127.0.0.1:4179/tests/v4-dashboard-preview.html`. Non occorrono credenziali o variabili Supabase per questa pagina; i valori demo restano marcati come sintetici.

## Commit

Il commit locale dello Sprint 01B contiene questo report; il relativo SHA è riportato nel riepilogo di consegna. La preview e gli screenshot restano locali; non è stato effettuato push.
