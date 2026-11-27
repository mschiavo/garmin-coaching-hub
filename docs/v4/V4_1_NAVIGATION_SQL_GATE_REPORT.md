# Garmin Coaching Hub V4 — Navigation Redesign e preparazione SQL Gate B

- **Data:** 27 novembre 2026
- **Worktree:** `D:\Repository\garmin-coaching-hub-v4`
- **Branch:** `feature/v4-visual-foundation`
- **Base verificata:** `8f17cd7c37847af352771ea8e71c6d106157363e`

## Stato sintetico

- **Navigation Redesign:** implementato e verificato con la suite Playwright completa, incluse le regressioni Auth/cambio account e le anteprime offline.
- **V4.1 SQL Gate B:** workflow e test predisposti localmente. Il gate database **non è superato**: in questa macchina non sono disponibili Docker, PostgreSQL, `psql`, `pg_dump`, `pg_restore` né `psycopg`; il workflow non è stato pubblicato o eseguito.
- Nessun push, merge, deploy, accesso cloud/reale o modifica ai worktree V3.
- Nessuna RPC o UI persistente Planning/Goal Center è stata iniziata.

## Navigation Redesign

`AppShell` ora dispone di:

- Sidebar desktop espandibile e collassabile, con la sola preferenza booleana `gch-v4-sidebar-collapsed` in `localStorage`; gli errori di storage non impediscono la navigazione.
- Voci primarie e menu “Altro” per mantenere raggiungibili tutte le sezioni senza occupare l'intera altezza. La lista desktop usa una singola area di scorrimento verticale con scrollbar nascosta.
- Rail tablet collassata con drawer contestuale, backdrop, chiusura Escape, ripristino del focus e contenimento della navigazione da tastiera.
- Barra inferiore mobile con quattro destinazioni principali e menu secondario touch; safe area rispettata e padding del contenuto sufficiente a non finire sotto la barra. Il pulsante “Altro” resta attivo quando la sezione selezionata è secondaria.
- Stato attivo (`aria-current`), nomi accessibili, tooltip nativi, focus visibile e gestione Escape/focus trap per i menu.
- Breakpoint dedicato per viewport basse in landscape; le sezioni secondarie restano accessibili anche lì.

La navigazione principale della dashboard live è `Panoramica`, `Allenamenti`, `Recupero` e `Prestazioni`. Training Load, Calendario, Attività, Insights, Advanced Analytics, Qualità dei dati e preview restano raggiungibili dal menu secondario. La preview mantiene le proprie destinazioni esistenti.

I test Playwright esistenti sono stati aggiornati per aprire il menu “Altro” quando la sezione non è primaria. Due test di preview contenevano assunzioni errate sulla nuova navigazione: uno selezionava la pagina Progresso mentre si aspettava la Dashboard a zoom 200%, l'altro cercava la voce secondaria mobile nella barra anziché nel menu. Le asserzioni funzionali sono state mantenute e rese esplicite con verifica di `aria-current` e del rendering atteso.

## Screenshot reali Playwright

Gli screenshot sono artefatti locali ignorati da Git, acquisiti dalla preview offline dopo il caricamento del grafico:

- [Desktop 1440 × 900](../../dashboard/test-results/v4-navigation-redesign/desktop-1440x900.png)
- [Desktop 1920 × 1080](../../dashboard/test-results/v4-navigation-redesign/desktop-1920x1080.png)
- [Tablet 768 × 1024](../../dashboard/test-results/v4-navigation-redesign/tablet-768x1024.png)
- [Mobile 390 × 844](../../dashboard/test-results/v4-navigation-redesign/mobile-390x844.png)
- [Mobile landscape 844 × 390](../../dashboard/test-results/v4-navigation-redesign/mobile-landscape-844x390.png)
- [Viewport basso / equivalente zoom 200%, 720 × 450](../../dashboard/test-results/v4-navigation-redesign/viewport-zoom-200-equivalent-720x450.png)

La prova include le dimensioni reali richieste desktop/tablet/mobile, landscape, menu e focus. Il caso 720 × 450 è una verifica di viewport ridotta, **non** un test del browser che imposta lo zoom nativo al 200%; lo zoom browser/OS resta non verificato in modo indipendente. I test esistenti V4 includono inoltre il controllo `document.documentElement.style.zoom = '200%'` per il contenimento.

## V4.1 SQL Gate B predisposto

File aggiunti/modificati:

- `.github/workflows/v41-planning-sql-gate.yml`
- `tests/test_v41_sql_workflow.py`
- `tests/sql/v41_planning_contract.py`

Il workflow è attivabile con `push` limitato al branch `feature/v4-visual-foundation` e ai file che alimentano il gate, oppure con `workflow_dispatch`. Oltre al workflow, migration e test 0036, i filtri includono solo i bootstrap, le migrazioni 0034/0035 e gli stub/test statici eseguiti dal job: modificarli può alterare il database sintetico o i controlli del gate. Ha permesso `contents: read`, checkout dello SHA evento senza credenziali persistenti e runner GitHub-hosted effimero `ubuntu-24.04`. Il servizio è PostgreSQL `17.6`, la porta è esposta solo su `127.0.0.1`, Python è `3.12.10` e il driver è `psycopg[binary]==3.2.6`. La concorrenza non annulla run esistenti. È usata solo una password sintetica inline; non sono riferiti secrets, Supabase cloud, Garmin, NAS o endpoint esterni.

Prima di creare i database, lo step identifica il container e rifiuta un'immagine diversa da `postgres:17.6`; acquisisce il `system_identifier` PostgreSQL, convalida il range intero e lo passa al test. Il client Python richiede host/hostaddr loopback, rifiuta connessioni service-based e verifica l'identificatore del cluster a ogni connessione. I quattro database con nomi dedicati devono essere assenti prima della creazione; il test rifiuta gli schemi non vuoti.

La sequenza prevista è:

1. `tests/sql/auth_stub.sql`, `supabase/bootstrap.sql`, `supabase/dashboard.sql`;
2. dato di attività sintetico soltanto nel database upgrade;
3. migration 0034, 0035 e 0036 nell'ordine;
4. test fresh/upgrade, ACL, RLS forced, ruoli, vincoli, revisioni, link, log eventi e invarianza dell'archivio sintetico;
5. errore SQL indotto prima del commit in un database separato e verifica che il rollback non lasci lo schema;
6. `pg_dump -Fc`, `pg_restore --exit-on-error --single-transaction` su un quarto database e controlli post-restore su dati, vincoli, RLS e ACL;
7. cleanup `if: always()` dei quattro database sintetici e del dump; il runner effimero elimina comunque il servizio.

Il test post-restore confronta il set di tabelle, definizioni e validità dei vincoli, indici, trigger, conteggi di tutte le tabelle Planning e la riga Garmin sintetica tra origine e ripristino; prova inoltre un vincolo dopo il restore. Il riepilogo Actions espone SHA testato ed esito per ciascuno step. Un gate obbligatorio fallito interrompe gli step dipendenti e rende la run non-success; `always()` è limitato a cleanup e riepilogo. Il test statico verifica anche che il SHA venga stampato senza command substitution Bash.

### Attivazione futura

Il file è solo locale. Non è stata avviata alcuna run. Il trigger push ristretto partirà quando un commit che modifica uno dei percorsi espliciti del gate sarà pubblicato sul branch V4. Per `workflow_dispatch`, il workflow deve essere prima presente sul branch predefinito affinché GitHub lo registri e lo renda selezionabile; ciò richiede una futura pubblicazione/integrazione autorizzata, non compresa in questa sessione. Dopo tale prerequisito, selezionare **V4.1 Planning SQL Gate B** in Actions indicando `feature/v4-visual-foundation`, oppure usare:

```powershell
gh workflow run v41-planning-sql-gate.yml `
  --repo mschiavo/garmin-coaching-hub `
  --ref feature/v4-visual-foundation
```

La run andrà considerata superata solo se il risultato complessivo è `success` e il riepilogo riporta tutti i gate (`workflow guard`, driver, identità/DB vuoti, migrazioni e contratti SQL, dump/restore, cleanup) come `success` sullo SHA desiderato.

## Verifiche eseguite

| Verifica | Risultato |
|---|---|
| `npm run build` (Node 22.23.5 dalla cache npm offline) | PASS — TypeScript e Vite, 2057 moduli |
| `npm run test:load` | PASS — 5/5 |
| `npm run test:analytics` | PASS — 27/27 |
| Playwright suite dashboard completa | PASS — 51 passati, 5 skip espliciti tra progetti desktop/mobile, 0 falliti (56 totali) |
| Test Auth/cambio account e richieste tardive | PASS — inclusi nella suite Playwright completa |
| Preview offline e assenza di chiamate esterne | PASS — test di preview esistenti nella suite completa |
| `tests/test_v41_sql_workflow.py` | PASS — 5/5 guard statici |
| `py_compile` test SQL e guard workflow | PASS |
| `npm audit --audit-level=moderate --offline` | PASS — 0 vulnerabilità |
| `git diff --check` | PASS |
| Actionlint, Gitleaks | NON ESEGUITI — binari non presenti nell'ambiente locale |
| Migration 0036, ACL/RLS, rollback e backup/restore PostgreSQL | NON ESEGUITI — Docker/PostgreSQL/client/psycopg non disponibili; gate B resta aperto |
| Workflow GitHub remoto | NON ESEGUITO — workflow non pubblicato e nessuna esecuzione remota autorizzata |

## Rischi e gate residui

1. **Gate B è ancora aperto.** Nessun risultato statico o sintetico locale certifica la migration PostgreSQL. Non procedere con RPC o UI Planning/Goal Center persistente prima di una run live del workflow effimero che superi tutti i gate.
2. Actionlint e Gitleaks devono essere eseguiti in un ambiente che li abbia disponibili prima di una pubblicazione/integrazione. La revisione statica locale non sostituisce questi strumenti.
3. L'autorizzazione GitHub per attivare Actions, oltre alla registrazione del workflow sul branch predefinito, è un prerequisito operativo successivo.
4. Non sono verificati integrazione con servizi reali o browser/OS zoom nativo; sono fuori dal perimetro e non necessari per il gate locale della navigazione.

## Operazioni Git

- Navigation Redesign: `4f808a4f2a2337a32e8cab46023950a5504223d5` (`feat(v4): redesign responsive navigation`).
- Workflow/test/documentazione SQL Gate B: commit locale separato, creato dopo le verifiche finali di questo gruppo.
- Nessun commit è stato pubblicato.
