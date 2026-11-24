# Garmin Coaching Hub — installazione indipendente V3.1.5

## 1. Prerequisiti

Account GitHub, chiave personale Garmin per la Personal API (non le credenziali Garmin Connect), nuovo progetto Supabase, Git, Node.js 22 LTS e Python 3.12 per le verifiche locali. I workflow cloud installano il proprio ambiente. Verificare disponibilità e limiti dei piani dei servizi.

## 2. Fork

Creare il fork da https://github.com/mschiavo/garmin-coaching-hub scegliendo tutti i branch (disattivare la copia del solo branch predefinito). Se il fork esiste già e manca la beta, clonare il proprio fork ed eseguire:

```sh
git remote add upstream https://github.com/mschiavo/garmin-coaching-hub.git
git fetch upstream
git switch -c feature/community-v3-beta upstream/feature/community-v3-beta
git push -u origin feature/community-v3-beta
```

Se upstream o il branch esistono già, non ricrearli: verificare `git remote -v`, `git branch -a` e sincronizzare senza force push. Nel proprio fork impostare `feature/community-v3-beta` come default branch da Settings. Questo rende disponibili i workflow manuali e fa usare alla pianificazione il codice beta. Non modificare il default branch del repository originale.

## 3. Database e autenticazione

Nel SQL Editor di un **nuovo** progetto Supabase eseguire in ordine `supabase/bootstrap.sql` e `supabase/dashboard.sql`. Non eseguire il bootstrap sul database esistente senza una verifica delle migrazioni.

Abilitare l'autenticazione Email, creare un utente email/password, confermare l'email se necessario e disabilitare le registrazioni pubbliche per l'istanza personale. Copiare il suo UUID da Authentication > Users ed eseguire (sostituire il segnaposto):

```sql
INSERT INTO dashboard_private.allowed_users(user_id)
VALUES ('UUID-UTENTE') ON CONFLICT (user_id) DO NOTHING;
```

L'RPC `public.dashboard_data()` consente solo gli utenti nella allowlist. Non rendere pubbliche le tabelle `coaching` per risolvere errori di login.

## 4. Configurazione GitHub

Nel fork, Settings > Secrets and variables > Actions:

| Tipo | Nome | Valore |
|---|---|---|
| Secret | `GARMIN_PERSONAL_API_KEY` | Chiave personale Garmin |
| Secret | `SUPABASE_DATABASE_URL` | Connessione PostgreSQL del proprio progetto, con password e SSL; usare un endpoint raggiungibile dal runner (es. session pooler se necessario) |
| Variable | `VITE_SUPABASE_URL` | URL base `https://<project-ref>.supabase.co` |
| Variable | `VITE_SUPABASE_PUBLISHABLE_KEY` | Chiave publishable/anon, mai service_role |
| Variable | `GARMIN_TIMEZONE` | Facoltativa, es. `Europe/Rome` |

I secret non vengono copiati con il fork. Non inserire password, token o URL di connessione nei file o nei report. Usare un URL PostgreSQL con password correttamente codificata.

## 5. Primo avvio

Abilitare Actions nel fork. Eseguire prima `Community Edition Checks`, poi `Test Garmin Authentication`. Eseguire `Garmin Supabase Sync` con 3 giorni. Verificare nel SQL Editor del proprio progetto:

```sql
SELECT count(*) FROM coaching.garmin_activities;
SELECT count(*) FROM coaching.garmin_daily_metrics;
```

Un conteggio zero delle attività può essere legittimo se non ci sono allenamenti nel periodo. Controllare anche le date, la presenza delle metriche e il riepilogo del job: assenza di dati e errori API non sono la stessa cosa.

La sincronizzazione pianificata usa il branch predefinito e può essere disabilitata finché il collaudo non è completato. La sua frequenza configurata è ogni tre ore. Lo storico usa blocchi da sette giorni e ha un limite di 45 minuti per job. Usare `Garmin History Import` con un mese non futuro in formato `YYYY-MM`, un mese alla volta, nel quale esistono dati. Un job riuscito può comunque avere metriche incomplete: leggere il riepilogo e riprovare se necessario.

## 6. Dashboard locale e pubblicazione

Per la prova locale, nella cartella `dashboard` copiare `.env.example` in `.env.local`, compilare i due valori VITE e lanciare `npm ci`, `npm run build`, `npm run dev`. Accedere con l'utente Supabase autorizzato. Verificare prima che `.env.local` sia ignorato da Git.

Per Pages scegliere Settings > Pages > Source: GitHub Actions. Consentire il branch beta nell'eventuale protezione dell'ambiente `github-pages`. In Actions avviare manualmente `Deploy Garmin Dashboard to GitHub Pages` selezionando `feature/community-v3-beta`. La beta consente il deploy esclusivamente da quel branch in un fork; non deploya sul repository upstream. Aprire il link mostrato dal job. Il percorso previsto è quello standard di un sito progetto GitHub Pages (`/<nome-repository>/`).

## 7. Sicurezza prima della distribuzione

Ogni tester usa il proprio progetto, chiave Garmin e account. Non condividere dati personali, screenshot non oscurati o credenziali. L'originale è pubblico: prima di distribuirlo verificare **tutta** la cronologia, incluse versioni precedenti degli ZIP e configurazioni, con secret scanner e revisione manuale. La rimozione di un file dall'ultimo commit non cancella la sua cronologia. Revocare/ruotare eventuali segreti esposti. Questo kit non certifica l'assenza di segreti storici.

Completare [la checklist](BETA_TEST.md) prima di attivare la sincronizzazione periodica.
