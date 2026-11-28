# Garmin Coaching Hub V4 — MVP del motore di coaching adattivo

**Stato:** MVP offline implementato; Gate B PostgreSQL V4.1 ancora **APERTO**  
**Branch:** `feature/v4-visual-foundation`  
**Workspace:** `D:\Repository\garmin-coaching-hub-v4`

**Commit locali dell’implementazione:**
- `cb2f1da10bc682ae763b40a8d261604c05bc0f06` — MVP engine e Coach Workspace offline.
- `96399e4b579c06e74818ff22f46443dba60781ce` — gestione fail-closed dell’evidenza copertura invalida.

## Risultato

È disponibile una prima analisi deterministica e spiegabile del piano rispetto alle attività osservate. Il motore produce una sola decisione per input: mantenimento, proposta modificativa oppure astensione. Ogni decisione include versione delle regole, motivi codificati, gravità non clinica, evidenze con provenienza e campioni, limiti e alternative.

La schermata **Coach · Analisi** è raggiungibile nella preview V4 offline. Offre tre fixture sintetiche: piano rispettato, scostamenti ripetuti con revisione di una seduta futura e copertura incompleta. Accetta/Rifiuta aggiorna soltanto un indicatore in memoria nella preview: non cambia il piano e non scrive dati.

## Regole applicate

- Regole versione `gch-coach-rules/0.1.0`; input con `referenceDate` civile esplicita, senza dipendenza dall’orologio macchina.
- Il collegamento seduta-attività richiede `plannedWorkoutId` esplicito e data coerente. Una coincidenza di giorno non dimostra l’associazione.
- Una seduta pianificata senza attività diventa uno scostamento verificato soltanto se la relativa data ha copertura `available`. Copertura parziale/ignota o stato completato senza attività associata portano all’astensione.
- Due scostamenti verificati (valore iniziale configurabile, 1–10) e una seduta futura `quality`/`hard` entro sette giorni (orizzonte configurabile, 1–14) consentono una proposta: la seduta resta nello stesso giorno e durata, ma passa a facile. È una revisione prudenziale del calendario, non un’affermazione di fatica.
- Sedute non si recuperano né si accumulano automaticamente. La gara fornita dall’utente entro l’orizzonte porta ad astensione perché il MVP non implementa tapering o regole post-gara.
- Input con date/identificativi/stati incoerenti, associazioni pendenti, duplicati o regole fuori limite falliscono in modo chiuso con astensione `invalid`.
- HRV, sonno, FC a riposo, stress e volume sono contesto descrittivo. Non producono score o soglie fisiologiche. Il confronto performance riusa `efficiencyChange()` e resta non disponibile/partial quando la coorte non raggiunge il minimo del modulo esistente.

## Integrazione e limiti deliberati

Il core puro in `dashboard/src/analytics/coaching.ts` riusa le funzioni esistenti `advancedLoad()` (`analytics/load.ts`), `efficiency()` / `efficiencyChange()` (`analytics/efficiency.ts`) e `recovery()` (`analytics/recovery.ts`). Le evidenze di copertura e gli oggetti attività rispettano il contratto dei tipi esistenti (`dates.ts` e `dataApi.ts`), senza modificare `dataApi.ts`.

Il Planning persistente non è collegato ai dati di `readArchive()`: il contratto API corrente non contiene sedute o associazioni `plannedWorkoutId`. Quindi il motore non deve ancora essere invocato sull’archivio live; l’unica esperienza completa disponibile è quella di preview con piano, obiettivo, associazioni e copertura interamente sintetici. L’integrazione con dati reali richiederà prima il superamento del Gate B PostgreSQL e poi API Planning/Goal autorizzate e testate.

Non sono state modificate migrazioni SQL, RPC, Auth, Supabase, ingestion Garmin, formule esistenti o dipendenze npm. Nessun servizio reale è stato contattato.

## File prodotti o aggiornati

- `dashboard/src/analytics/coaching.ts` — tipi dominio, valutazione deterministica, evidenze e proposte.
- `dashboard/src/components/v4/CoachWorkspacePreview.tsx` — workspace offline con report testuale, piano vs eseguito, prima/dopo e scelta simulata.
- `dashboard/src/components/v4/DashboardPreview.tsx` — voce di navigazione e montaggio del Coach Workspace.
- `dashboard/src/components/v4/v4-components.css` — stili responsivi riutilizzando token V4.
- `dashboard/tests/coaching.test.mjs` — regressioni del motore.
- `dashboard/tests/coach-preview.spec.ts` — browser test desktop/mobile e verifica assenza di richieste esterne.
- `dashboard/package.json` — include il test del motore in `test:analytics`; nessuna dipendenza aggiunta.

## Verifiche locali

Eseguite nel worktree V4 con Node 22.23.5 disponibile dalla cache npm:

| Verifica | Risultato |
|---|---:|
| `npm run test:analytics` (incluse le regressioni del Coach) | 44 test superati |
| `npm run test:load` | 5 test superati |
| `npm run build` (TypeScript + Vite) | superato |
| `npx playwright test` suite dashboard completa | 53 superati, 5 skip previsti dai guard desktop/mobile |
| Playwright `coach-preview.spec.ts` desktop e mobile | 2 superati; 0 richieste a host esterni |
| `git diff --check` | superato |

Le regressioni includono output ripetibile/idempotente, copertura missing/partial/verified, collegamenti espliciti, duplicati e conflitti, DST, limiti configurabili, gara imminente, baseline mancante, volume insolito e segnali recovery discordanti. Sono rimasti verdi anche i test browser preesistenti di Auth e cambio account; sono test locali con fixture, non integrazione Auth remota.

Gitleaks non è stato eseguito perché lo strumento non risulta disponibile nel PATH locale. `npm audit` non è stato eseguito: nessuna dipendenza è stata aggiunta o cambiata. Non sono stati eseguiti test PostgreSQL/backup-restore: non fanno parte di questa validazione offline e il Gate B resta aperto.

## Screenshot e anteprima

Screenshot Playwright prodotti localmente (artefatti ignorati da Git):

- Desktop, mantenimento 1440×900: `dashboard/test-results/adaptive-coach/coach-maintain-desktop-1440x900.png`
- Desktop, modifica 1440×900: `dashboard/test-results/adaptive-coach/coach-modify-desktop-1440x900.png`
- Mobile, astensione 390×844: `dashboard/test-results/adaptive-coach/coach-abstain-mobile-390x844.png`

Per aprire la preview, dalla directory `dashboard`:

```powershell
npm exec --offline --yes --package=node@22 -- npm run dev -- --host 127.0.0.1 --port 4179
```

Aprire `http://127.0.0.1:4179/tests/v4-dashboard-preview.html`, selezionare **Altro → Coach · Analisi** e cambiare lo scenario dal menu. È una pagina statica locale; i test Playwright hanno verificato che non contatti host esterni.

## Gate e prossimo passo

Il Gate B è **APERTO**. L’ultimo risultato PostgreSQL noto per il gate V4.1 è la run `46071087729`, fallita su due test di contratto; le correzioni locali precedenti non sono state convalidate da una nuova esecuzione PostgreSQL in questo incarico. Restano quindi da eseguire il gate effettivo su PostgreSQL effimero, compatibilità fresh/upgrade, atomicità/rollback e backup/restore. Nessuna migrazione o RPC persistente del Coach è iniziata.

**Prossimo passo unico:** dopo avere autorizzato separatamente la pubblicazione/attivazione del workflow, eseguire il Gate B PostgreSQL sul commit che contiene le correzioni locali V4.1; procedere alle API persistenti soltanto dopo esito positivo completo.

## Operazioni Git e sicurezza

Nessun push, merge, deploy, accesso a Supabase cloud, Garmin reale, NAS o database è stato eseguito. `main` e i worktree V3 non sono stati modificati. Il report è un commit documentale separato; il suo SHA è riportato nella consegna conclusiva.
