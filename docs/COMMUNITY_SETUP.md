# Garmin Coaching Hub — installazione indipendente (bozza V2.1)

Questa guida riguarda una **nuova istanza** e non richiede accesso al database del maintainer.

## Prerequisiti
- Account GitHub e fork del repository
- Account Garmin e accesso all'API personale usata dagli script del progetto
- Progetto Supabase personale
- GitHub Pages abilitabile nel fork

## Installazione
1. Crea un fork del repository nel tuo account GitHub.
2. Crea un nuovo progetto Supabase. Nel suo SQL Editor esegui, in ordine, `supabase/bootstrap.sql` e `supabase/dashboard.sql`.
3. In Supabase Authentication abilita Email, disabilita le registrazioni pubbliche se l'istanza è personale, crea un utente e confermane l'email.
4. Copia l'UUID dell'utente e autorizzalo con:
   ```sql
   INSERT INTO dashboard_private.allowed_users(user_id)
   VALUES ('UUID-UTENTE') ON CONFLICT (user_id) DO NOTHING;
   ```
5. Nel fork configura **Settings > Secrets and variables > Actions > Secrets**:
   - `GARMIN_PERSONAL_API_KEY`: chiave personale Garmin
   - `SUPABASE_DATABASE_URL`: stringa di connessione PostgreSQL del **tuo** Supabase
6. In **Actions > Variables** configura:
   - `VITE_SUPABASE_URL`: Project URL, formato `https://<project-ref>.supabase.co` (senza `/rest/v1`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: chiave publishable/anon del tuo Supabase
7. In **Settings > Pages** seleziona **GitHub Actions**.
8. Abilita i workflow del fork. Avvia manualmente **Garmin Supabase Sync** per verificare l'importazione recente.
9. Avvia **Deploy Garmin Dashboard to GitHub Pages** e prova l'accesso.
10. Per lo storico usa **Garmin History Import**. **Limite attuale:** lo script e il workflow presenti su `main` consentono soltanto mesi del 2026; la generalizzazione è un lavoro successivo, non ancora disponibile in questa bozza.

## Isolamento e sicurezza
Ogni fork deve usare il **proprio** progetto Supabase e i **propri** secret. Non condividere credenziali né URL PostgreSQL. La chiave publishable è destinata al frontend; la password database e la chiave Garmin non devono comparire nel frontend, nei commit o nei log. L'RPC `public.dashboard_data()` controlla la allowlist sul server.

## Attenzione prima di pubblicare o distribuire
Il repository originale risulta già pubblico. Prima di diffonderlo verificare cronologia Git, ZIP già committati e file di configurazione per eventuali credenziali o dati personali. Ruotare immediatamente ogni segreto che sia stato esposto. Non considerare sicuro un segreto solo perché rimosso dall'ultimo commit.

## Roadmap
- Parametrizzare anno/mese dell'importazione storica e fuso orario
- Aggiungere validazioni di setup e test automatici
- Versionare le migrazioni SQL e verificare un'installazione completamente pulita
- Estendere i dati Garmin per split, intervalli e zone cardiache
