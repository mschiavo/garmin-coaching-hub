# Garmin Coaching Hub V4 — Sprint 01C Visual Convergence

**Branch:** `feature/v4-visual-foundation`
**Base:** commit locale Sprint 01B `e49ad35edc6182660d4da676fe45d2440f73e12d`
**Perimetro:** revisione della Home e della preview sintetica; nessuna modifica a Auth, RPC, ingestion Garmin o schema dati.

## Scelte di design

- Ho dato alla Home una gerarchia riconoscibile: testata compatta con periodo/atleta demo, hero blu notte con titolo prominente, riepilogo dei giorni osservati e quattro KPI distinti per colore semantico.
- Le KPI mostrano microtrend soltanto quando i sette giorni sono coperti (attività) o hanno sette misure giornaliere valide (HRV/sonno). Le linee descrivono i campioni e non dichiarano miglioramenti o stato fisiologico.
- Il volume settimanale è il pannello dominante, con unità, somma esplicita dei soli valori disponibili, grafico area leggibile e tabella consultabile. I valori mancanti restano lacune, non diventano zeri.
- La settimana affianca il grafico con anello più ampio e target attuale/obiettivo. Il ring è mostrato soltanto con un target valido: nella preview è un target demo etichettato; nell’app reale resta uno stato “target non configurato” finché l’archivio non ne fornisce uno.
- Performance e segnali di recupero hanno pannelli distinti, serie compatte e campioni dichiarati. Non ho aggiunto TRIMP, readiness, VO₂max, VDOT, proiezioni o giudizi “buono/stabile” senza fonti e soglie validate.
- Ho rimosso l’import Google Fonts remoto già presente nel foglio globale. La preview usa ora solo risorse locali e font di fallback di sistema; la tipografia resta gerarchica e leggibile anche offline.

La struttura riprende il mockup Home (sidebar attiva, testata con periodo e atleta, KPI, grafico dominante, riepilogo settimana, Performance/Recovery e archivio recente), oltre a colori e spaziature dei mockup Recovery e progressi settimanali. Non sono stati riprodotti gli sfondi fotografici, i volti atleta o le aree Planning/Goal/Insights: sono decorazioni o contratti non disponibili nel modello attuale. Sono rimasti intenzionalmente fuori anche Coach Insights e le metriche derivate prive di fonti verificate.

## Preview e screenshot

Pagina locale completa: `http://127.0.0.1:4179/tests/v4-dashboard-preview.html`. Avvio da `D:\Repository\garmin-coaching-hub-v4\dashboard`:

```powershell
npm run dev -- --host 127.0.0.1 --port 4179
```

Non servono credenziali. I dati sono sintetici e identificati nella pagina. La preview non importa `main.tsx`, non crea un client Supabase e non invia richieste a Garmin, Supabase o altri host.

Gli screenshot Playwright, esclusi da Git, sono in `dashboard/test-results/v4-visual-preview/`:

- `home-1440x900.png` e `home-1440x900-full.png`
- `home-1440x900-light.png`
- `home-1920x1080.png` e `home-1920x1080-full.png`
- `home-768x1024.png` e `home-768x1024-full.png`
- `home-390x844.png` e `home-390x844-full.png`

I file `-full` mostrano l’intera pagina scorrevole; i file senza suffisso sono acquisiti alla viewport esatta richiesta. Il test controlla che tutte le richieste del browser restino su loopback, tutte le aree siano visibili e non vi sia overflow orizzontale globale. Navigazione touch, cambio tema e viewport equivalente a zoom 200% sono inclusi.

## File del progetto

- `dashboard/src/main.tsx`: selettore periodo nella testata Home e titolo sempre accessibile anche durante errori/autorizzazione negata; le altre sezioni mantengono il loro header.
- `dashboard/src/components/v4/DashboardHome.tsx`: hero, riepiloghi e visualizzazioni basati sui record/copertura esistenti.
- `dashboard/src/components/v4/DashboardPreview.tsx`: stessa composizione con dati dimostrativi locali.
- `dashboard/src/components/v4/MetricCard.tsx`: microtrend opzionali con controllo dei campioni e testi accessibili.
- `dashboard/src/components/v4/v4-components.css`: gerarchia visiva, superfici, KPI, chart, ring e breakpoints desktop/mobile/tema chiaro.
- `dashboard/src/style.css`: rimosso il caricamento tipografico da Google Fonts per mantenere la preview interamente locale.
- `dashboard/tests/v4-visual-preview.spec.ts`: screenshot e verifiche visuali/rete responsive.
- Questo report.

Non ho trovato file obsoleti con prova sufficiente per una rimozione sicura; fixture catalogo e test storici sono stati conservati.

## Verifiche

Verifiche eseguite il 27 novembre 2026:

- `npm run build`: superata (TypeScript e Vite, 2.055 moduli trasformati).
- Training Load: 5/5 superati.
- Analytics/API: 15/15 superati.
- Playwright: 44 superati, 2 skipped intenzionali per eseguire ciascun test di viewport nel progetto desktop o mobile corretto; suite complessiva 46 casi. Include regressioni Auth/cambio account e rete, preview offline responsive e screenshot.
- `npm audit --audit-level=moderate`: 0 vulnerabilità.
- `git diff --check`: superato.
- Il comando Node preinstallato (20.10.0) non soddisfa `engines >=22` e non esegue i test TS; le suite sono state quindi eseguite con Node 22.23.5. Non è stata cambiata la configurazione globale.

Le regressioni Auth locali usano le fixture sintetiche già presenti: non equivalgono a un collaudo live di Supabase o Garmin. Per la verifica browser la dashboard è stata avviata con URL e chiave Supabase sintetici; il test della preview ha verificato che tutte le risorse richieste restassero su loopback. Nessun accesso a servizi esterni è stato effettuato. I test PostgreSQL/Supabase live non fanno parte di questa verifica visuale e non sono stati eseguiti.

## Commit e stato repository

Commit locale: da registrare dopo la revisione e il commit. Worktree da verificare pulito dopo il commit. Non è stato effettuato push, merge o deploy.
