# Garmin Coaching Hub — Dashboard V1

Dashboard privata React/TypeScript, ospitata su GitHub Pages e collegata a Supabase tramite Auth e una RPC PostgreSQL con allowlist. **Non sostituisce** gli script di sincronizzazione Garmin esistenti.

## Funzionalità
- Login con email/password Supabase Auth.
- Panoramica: km, numero corse, sonno, HRV, FC a riposo.
- Allenamenti: km e numero corse per settimana.
- Recupero: HRV, sonno, FC a riposo, stress, Body Battery carica/consumo, passi.
- Attività: tabella di corse e trail, distanza, durata, ritmo, FC.
- Filtri 30/90/180/365 giorni o tutto lo storico.
- Valori mancanti esclusi dalle medie, nessuna imputazione.

## 1. Integrare nel repository esistente
Copiare la cartella `dashboard/`, la cartella `supabase/` e il file `.github/workflows/dashboard-pages.yml` nella **radice** del repository `garmin-coaching-hub`. Non cancellare i file esistenti.

## 2. Supabase — autenticazione e database
1. Nel progetto Supabase aprire **SQL Editor** ed eseguire `supabase/dashboard.sql` con un ruolo amministrativo.
2. In **Authentication > Providers > Email**, mantenere abilitato il login email/password e **disabilitare la registrazione pubblica** (opzione Sign ups / Allow new users to sign up). Impostare anche la verifica email secondo le proprie preferenze.
3. In **Authentication > Users**, creare il proprio utente tramite **Add user**. Annotare il suo UUID.
4. Eseguire nel SQL Editor, sostituendo l'UUID:
   ```sql
   INSERT INTO dashboard_private.allowed_users(user_id)
   VALUES ('IL-TUO-UUID')
   ON CONFLICT (user_id) DO NOTHING;
   ```
5. Verificare che `public` sia tra gli schemi esposti dalla Data API (impostazione usuale). La funzione `public.dashboard_data()` è accessibile soltanto agli utenti autenticati presenti nella allowlist.
6. Non abilitare nuove policy RLS generiche sulle tabelle `coaching`. Non inserire mai `service_role`, password Garmin o URL PostgreSQL nel codice frontend.

**Nota sicurezza:** GitHub Pages pubblica i file HTML/JS/CSS. I dati Garmin non sono inclusi nel build: vengono letti dopo il login tramite RPC. La chiave Supabase *publishable/anon* è pubblica per definizione; la protezione effettiva è il controllo server-side della funzione SQL. Il login non impedisce di visualizzare la pagina HTML, ma impedisce di leggere i dati senza autorizzazione.

## 3. GitHub — variabili e Pages
1. Repository > **Settings > Secrets and variables > Actions > Variables**: aggiungere
   - `VITE_SUPABASE_URL`: URL HTTPS del progetto Supabase.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: chiave **publishable** (o anon legacy), mai service_role.
2. Repository > **Settings > Pages > Build and deployment**: scegliere **GitHub Actions**.
3. Controllare il nome del branch predefinito. Il workflow usa `main`: se il branch è diverso, aggiornare `branches` nel workflow.
4. Fare push di tutti i file. Aprire Actions > **Deploy Garmin Dashboard to GitHub Pages**. URL tipico: `https://<utente>.github.io/garmin-coaching-hub/`.
5. Se la pagina è visibile ma i dati non vengono caricati, verificare allowlist, variabili GitHub e funzione SQL.

## 4. Sviluppo locale
```bash
cd dashboard
cp .env.example .env.local
# Compilare .env.local con URL e chiave pubblicabile Supabase
npm install
npm run dev
```
Lanciare `npm run build` prima del deploy. Committare anche il `package-lock.json` prodotto da `npm install` (incluso nel pacchetto se l'ambiente di build lo ha consentito).

## 5. Limiti consapevoli della V1
- Le analisi sono descrittive, non consigli medici.
- Per il grafico HRV e gli altri grafici giornalieri, su periodi lunghi il frontend campiona i punti visualizzati; le medie usano tutti i giorni.
- La RPC restituisce fino a 2000 righe per ciascun insieme, sufficienti per l'attuale storico, ma da paginare in futuro.
- Le date giornaliere usano la data Garmin salvata nel database.
- Body Battery `charged` e `drained` sono variazioni, non livello al risveglio.
- I dettagli avanzati delle singole attività (split, serie, elevazione, tracce GPS) sono rinviati alla V2.
- La privacy dipende anche dalla sicurezza dell'account Supabase, dal mantenimento della allowlist e dai permessi SQL. Consigliata MFA ove disponibile.
