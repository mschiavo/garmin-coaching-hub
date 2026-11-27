# Garmin Coaching Hub V4 — Sprint 01D Mockup Fidelity

**Branch:** `feature/v4-visual-foundation`
**Base:** `e2ceb569dd1f8c3946c39229334a079a8ca3ae49`
**Perimetro:** composizione Home, anteprima sintetica offline e test visuali; nessun intervento su Auth, RPC, ingestion o schema dati.

## Riferimento e confronto visuale

Riferimento ispezionato: `D:\Repository\garmin-v4-planning\mockup\01_dashboard_desktop.png` (1600×1000). La preview è stata acquisita a 1440×900, 1920×1080 e 390×844. Le misure desktop riportate sotto provengono dal DOM Playwright a 1440×900, non da una stima visiva.

| Elemento | Mockup Dashboard | Preview Sprint 01D | Esito / differenza residua |
|---|---|---|---|
| Sidebar | Barra fissa a sinistra, circa 220 px | Fissa, 220 px a 1440; navigazione touch su mobile | Composizione e ingombro allineati. Non è stato aggiunto lo sfondo fotografico del mockup. |
| Header | Titolo, sottotitolo e controlli in un’unica riga compatta | 76 px; titolo/sottotitolo, periodo, atleta sintetico, stato demo e tema | Stessa gerarchia; nella preview il banner demo è integrato nel sottotitolo/header per lasciare spazio ai dati. |
| KPI | Quattro card in una riga, subito sotto l’header | Quattro card nella stessa riga; inizio y=90, altezza 111 px | Rispetta la fascia richiesta 95–120 px. Accenti, icone e trend sono basati su campioni disponibili. |
| Grafico + settimana | Grafico principale a sinistra e piano a destra, circa 2:1 | Inizio y=212; larghezze 775/381 px (rapporto 2,03); altezza comune 296 px | Posizioni e proporzioni allineate. La serie mostra barre settimanali in km, unità e legenda. |
| Training Load / Recovery | Barre TRIMP e linea readiness combinate | Volume di corsa osservato in km, tooltip/assi/legenda; recupero separato sotto | Nessun TRIMP né readiness è calcolato o etichettato senza una fonte verificata. |
| Piano/progresso | Sette giorni, attività pianificate e completate, target | Sette giorni osservati, date, sedute e copertura; ring solo con target valido | L’archivio non fornisce un piano persistente: la Home reale dichiara che manca. Il target esiste solo nella fixture, marcato demo. |
| Performance | Snapshot con tre metriche e confronto storico | Ritmo medio ponderato, corsa più lunga, FC media, campioni/provenienza | I valori derivano da attività complete disponibili. Proiezioni e confronti non supportati restano esclusi. |
| Recovery | Quattro righe con valore e sparkline | HRV, sonno, FC a riposo e stress, con conteggio campioni e sparkline; Body Battery condizionale | Coerente con le misure giornaliere presenti; mancanze/parzialità non vengono convertite in zero. |
| Attività e insight | Tabella attività recenti e Coach Insights | Tabella attività e stato/copertura dell’archivio | Non è generato un giudizio narrativo da coach senza contratto o logica validata. La qualità/copertura dati occupa quel pannello. |
| Densità a 1440×900 | KPI e due righe principali visibili, tabella in avvio sotto la piega | Riga KPI y=90; grafico/settimana y=212; Performance/Recovery y=519; attività/copertura y=761 | Il flusso e l’ordine sono comparabili; i pannelli si adattano alle metriche/campioni e la tabella continua sotto la piega. |
| Mobile | Non rappresentato nel riferimento desktop | 390×844; KPI a due colonne, navigazione touch, grafico impilato, nessun overflow globale | La settimana prosegue sotto la piega; microtrend KPI nascosti per evitare sovrapposizioni al testo. |

Screenshot completi e screenshot viewport sono stati ispezionati dopo l’acquisizione. Il confronto ha rilevato e corretto l’hero autonomo, l’altezza eccedente delle card, il ring troppo compresso e le barre del grafico precedentemente poco leggibili. Il grafico ora usa barre espanse per i quattro punti settimanali della fixture; il componente `Plot` mantiene il valore predefinito di larghezza per gli altri grafici.

## Scelte di correttezza

- Il titolo Home e i controlli restano nell’header compatto; non c’è una hero-card autonoma.
- L’ordine segue i blocchi del mockup: KPI → volume/settimana → Performance/Recovery → attività/copertura.
- Le quattro KPI usano trend soltanto quando la copertura dei sette giorni/campioni lo consente. Su viewport mobile i trend non si sovrappongono ai metadati.
- La visualizzazione è chiamata volume in km, non TRIMP. Non viene inventata una serie Recovery/readiness per sovrapporla al volume.
- Il riepilogo non presenta come pianificata un’attività osservata. Il ring compare solo quando i valori del target sono validi; l’unico obiettivo della fixture è esplicitamente demo.
- HRV, sonno, FC a riposo e stress mostrano il proprio conteggio e la propria serie; Body Battery compare solo se ci sono misure.
- La preview non importa il client Auth/Supabase e non effettua richieste remote. La verifica browser limita le risorse a loopback.

## File modificati

- `dashboard/src/components/v4/DashboardHome.tsx`: composizione e riepilogo settimanale.
- `dashboard/src/components/v4/DashboardPreview.tsx`: header compatto con dati sintetici dichiarati.
- `dashboard/src/components/v4/v4-components.css`: misure desktop, responsive e densità coerenti.
- `dashboard/src/main.tsx`: sottotitolo Home compatto; le altre sezioni non cambiano.
- `dashboard/src/charts.tsx`: prop opzionale `barMaxSize`, valore predefinito invariato per compatibilità.
- `dashboard/tests/v4-visual-preview.spec.ts`: controlli proporzioni/layout desktop oltre a screenshot e rete offline.
- Questo report.

Nessun file legacy è stato rimosso: non è emersa alcuna rimozione necessaria a questo sprint.

## Screenshot e preview

Anteprima locale: `http://127.0.0.1:4179/tests/v4-dashboard-preview.html`.

Percorsi, esclusi da Git:

- Desktop: `dashboard/test-results/v4-visual-preview/home-1440x900.png` e `home-1440x900-full.png`.
- Desktop largo: `dashboard/test-results/v4-visual-preview/home-1920x1080.png` e `home-1920x1080-full.png`.
- Mobile: `dashboard/test-results/v4-visual-preview/home-390x844.png` e `home-390x844-full.png`.
- Tablet: `dashboard/test-results/v4-visual-preview/home-768x1024.png` e `home-768x1024-full.png`.
- Tema chiaro: `dashboard/test-results/v4-visual-preview/home-1440x900-light.png`.

Avvio da `D:\Repository\garmin-coaching-hub-v4\dashboard`:

```powershell
npm run dev -- --host 127.0.0.1 --port 4179
```

## Verifiche

Completate sul codice finale:

- `npm run build`: TypeScript e Vite superati.
- Training Load: 5 test superati.
- Analytics/API: 15 test superati.
- Playwright: 44 passati e 2 skipped intenzionali, perché ogni test della preview è eseguito nel progetto viewport desktop o mobile previsto. I test includono Auth/cambio account con fixture, responsive/zoom, navigazione touch, verifica rete e screenshot.
- Preview visuale: asserzioni DOM per 4 KPI allineati, altezza KPI 95–120 px, sidebar/header, rapporto tra pannelli volume/settimana, ordine delle righe e quattro barre reali del grafico.
- `npm audit --audit-level=moderate`: zero vulnerabilità.
- `git diff --check`: superato.

I test Auth sono simulazioni di regressione browser già presenti e non sono un’integrazione con un backend Auth vivo. Non sono stati usati Supabase, Garmin, account o dati reali. Il mockup usa contenuti illustrativi (TRIMP/readiness, piani e insight) che restano fuori dalla Home finché mancano fonti/contratti verificati.

## Commit e operazioni

SHA del commit locale e stato worktree: riportati nella consegna dello Sprint 01D, dopo la verifica Git conclusiva. Nessun push, merge o deploy.
