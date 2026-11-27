# V4.1 — Piano di pulizia (non eseguito)

**Stato:** solo piano. Nessuna cancellazione/spostamento autorizzato o effettuato. L'audit completo è in `V4_1_FILESYSTEM_AUDIT.md`.

## Principi e perimetro

1. Non intervenire su `main`, refs/branch, report storici, migrazioni, fixture, backup, `.env`, worktree V3.2/V3.3/V3.4.1 o artefatti evidenza senza approvazione specifica.
2. Non eseguire `git clean`, rimozione ricorsiva generica, script one-shot o cancellazioni dal repository beta.
3. Una futura pulizia V4 può riguardare esclusivamente i path generati elencati sotto, dopo conferma e controllo che non siano in uso; prima preservare gli screenshot Playwright.
4. I file untracked nel worktree beta e `.cache`/`.venv` V3.4.1 richiedono un audit/decisione separata, non sono inclusi nella pulizia V4.

## Sequenza proposta per una futura approvazione

### 1. Preservare le evidenze visuali

- Copiare `dashboard/test-results/v4-advanced-preview/` e `v4-visual-preview/` in un archivio V4 approvato, includendo manifest con SHA-256, timestamp, commit testato e viewport.
- Confrontare copie/hash e aprire almeno un file di ciascuna vista/viewport.
- Mantenere originale finché verifica archive non è completata.

### 2. Candidati regenerabili esclusivamente V4

| Path esatto | Dimensione osservata | Rigenerazione prevista |
|---|---:|---|
| `D:\Repository\garmin-coaching-hub-v4\dashboard\node_modules` | 160.812.471 B | `npm ci` usando lockfile V4 |
| `D:\Repository\garmin-coaching-hub-v4\dashboard\dist` | 1.165.886 B | `npm run build` |
| `D:\Repository\garmin-coaching-hub-v4\dashboard\tsconfig.tsbuildinfo` | 894 B | build TypeScript |
| `D:\Repository\garmin-coaching-hub-v4\__pycache__`, `tests\__pycache__`, `tests\sql\__pycache__`, `tools\__pycache__` | 285.392 B totali | interpreter/test Python |

Totale candidato massimo: **162.264.643 B (~154,8 MiB)**; esclude 14.067.848 B di screenshot e i restanti test-results. I path vanno verificati singolarmente e non cancellati se cambiano o contengono dati non rigenerabili.

### 3. Controlli prima/dopo

- Confermare branch/worktree V4 e status; fermarsi se ci sono modifiche non previste.
- Verificare assenza di processi Node/Vite/Playwright/Python con working directory nei path candidati, per quanto rilevabile senza terminare processi.
- Ricalcolare path, dimensioni e file list; verificare che i soli path approvati siano coinvolti.
- Richiedere approvazione esplicita successiva per la cancellazione; usare solo rimozione puntuale, non `git clean` e non `-Force` per worktree.
- Dopo approvazione e rimozione puntuale, verificare `npm ci`, build, test locali pertinenti e status Git; gli output rigenerati non vanno aggiunti a Git.
- Nessuna operazione viene proposta per V3 o per le copie `garmin-release-evidence`.

## Operazioni che richiedono approvazione separata

- Eliminare qualunque cache/build V4 nonostante sia rigenerabile.
- Archiviare screenshot fuori dal worktree o eliminarli dopo copia verificata.
- Esaminare/archiviare/eliminare `garmin_v32_one_shot.py` e `INSTALL-V315.txt` del worktree beta.
- Rimuovere cache/venv/build/test-results da DEV V3.4.1 o beta.
- Rimuovere i backup pre-v3.1.2, ZIP beta, report storici, mockup o evidenze del consolidation.
- Aprire/gestire `.env.local` o qualunque file con credenziali. Questo audit non ha letto segreti.

Finché non arriva l'approvazione per un'operazione specifica, il piano non deve essere eseguito.
