# Collaudo V3.4.1

Il percorso locale verifica SQL, dashboard e writer simulato. Il percorso Supabase richiede un progetto separato, account sintetici e approvazione per provisioning, migrazione, fixture e ogni scrittura di collaudo. Il percorso Garmin reale richiede un’autorizzazione successiva e distinta.

## A. PostgreSQL locale isolato

Usare Python 3.12, Node 22 e PostgreSQL 17 come in CI. PostgreSQL 14 è il minimo richiesto dalla migrazione. Da PowerShell avviare un’istanza di test sulla porta 55441 in una directory nuova. Usare un cluster sintetico vuoto se i percorsi o i nomi esistono già.

```powershell
New-Item -ItemType Directory -Force .cache | Out-Null
initdb -A trust -U postgres -E UTF8 -D .cache/pg-v341-local
if ($LASTEXITCODE) { throw "Init fallito" }
pg_ctl -D .cache/pg-v341-local -l .cache/pg-v341-local.log -o "-h 127.0.0.1 -p 55441" start
if ($LASTEXITCODE) { throw "Avvio fallito" }
foreach ($db in 'v34_fresh','v34_upgrade','gch_v341_fixture','gch_v341_upgrade','gch_v341_restore') {
  createdb -h 127.0.0.1 -p 55441 -U postgres $db
  if ($LASTEXITCODE) { throw "Creazione database sintetico fallita" }
}
$env:V34_TEST_DSN = 'host=127.0.0.1 port=55441 user=postgres dbname=postgres'
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python -m unittest discover -s tests/sql -v
```

La suite SQL installa schema e fixture e lascia `gch_v341_fixture` disponibile per il restore. Per una prova manuale indipendente, usare i quattro file del fresh install più `tests/sql/auth_stub.sql` come primo passo. Generare il file con il comando seguente e applicarlo con `psql -X -h 127.0.0.1 -p 55441 -U postgres -d gch_v341_fixture -v ON_ERROR_STOP=1 -f .cache/v341-fixture.sql` soltanto su un database applicativo vuoto con nome esatto.

In locale, la suite e la fixture predefinita richiedono che anche il backend PostgreSQL risponda su `127.0.0.1`. Su GitHub Actions il runner raggiunge la porta pubblicata su loopback, mentre il backend risponde dalla rete del container. Il job legge `system_identifier` direttamente dal servizio `postgres:17` con `docker exec` e lo confronta con il cluster raggiunto prima di creare i database. La suite ripete il confronto a ogni connessione e la fixture verifica nuovamente identità esatta, nome del database e archivio vuoto. `GCH_TEST_POSTGRES_SYSTEM_ID` è riservata alla suite SQL e viene impostata dal workflow. La generazione CLI conserva le proprie guardie per locale e staging.

```powershell
python -X utf8 -m tools.staging_fixture --reference 2024-03-05 --size large |
  Set-Content -Encoding utf8NoBOM .cache/v341-fixture.sql
```

La fixture è deterministica per data e dimensione, con sequenze e formule fisse. Il profilo small produce 10 attività fisiche, di cui 9 leggibili via V2, e 8 giornate. Il profilo large produce 2.503 attività fisiche, di cui 2.502 via V2, e 2.501 giornate. Entrambi includono 6 righe di copertura, un ID con data nulla escluso, una data bisestile, più attività nello stesso giorno, ID oltre 2^53, running, trail e cycling, campi mancanti, recupero nullo e misure a zero. La data di riferimento rappresenta il giorno corrente nella fixture. Per il browser usare la data corrente di Europe/Rome oppure filtrare Tutto lo storico con data riproducibile. L’opzione `--legacy` omette le sei righe di copertura per installare i dati prima di 0034. Il file rifiuta un archivio popolato.

Il dump locale contiene lo stub Auth e le RPC pubbliche. I ruoli stub devono esistere nell’istanza del restore.

```powershell
pg_dump --version
pg_restore --version
pg_dump -h 127.0.0.1 -p 55441 -U postgres -Fc -f .cache/v341-local.dump gch_v341_fixture
pg_restore --list --file=.cache/v341-local.toc .cache/v341-local.dump
pg_restore -h 127.0.0.1 -p 55441 -U postgres --exit-on-error --single-transaction -d gch_v341_restore .cache/v341-local.dump
```

Eseguire le query della sezione di verifica su sorgente e ripristino. Attesi conteggi fisici 2503/2501/6, una riga allowlist, stessi hash e privilegi. Verificare anche le RPC su entrambi i database.

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.dashboard_metadata_v2() -> 'reliability_version',
       public.dashboard_metadata_v2() #>> '{activities,count}',
       jsonb_array_length((public.dashboard_data()::jsonb) -> 'activities');
ROLLBACK;
```

Attesi capability 1, 2502 attività V2 e 2000 righe legacy. Quando termina la prova, fermare con `pg_ctl -D .cache/pg-v341-local stop` solo il cluster sintetico creato per questa esecuzione.

## B. Supabase dedicato

### 1. Progetto, Auth e destinazione

1. Verificare disponibilità e costi del piano nel Dashboard. Creare un progetto staging separato con password DB nuova. Registrare localmente i ref verificati di staging e produzione. In **Connect** verificare host diretto, nome DB e progetto. Usare TLS `verify-full` e la CA di staging. Se manca la connettività diretta, il toolkit blocca il pooler. Usare un percorso di rete diretto o limitare l’attività a revisione SQL e test locali. [Connessioni PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) · [TLS PostgreSQL](https://supabase.com/docs/guides/platform/ssl-enforcement)
2. In Authentication creare e confermare due utenti sintetici con credenziali distinte. Abilitare Email/Password e disabilitare le iscrizioni pubbliche se superflue. Dopo `dashboard.sql` inserire con `INSERT INTO dashboard_private.allowed_users(user_id) VALUES ('<UUID_ACCOUNT_SINTETICO>');` solo l’UUID autorizzato. Lasciare fuori allowlist il secondo utente. Esporre lo schema pubblico per le RPC e tenere privati `coaching` e `dashboard_private`. [Configurazione Auth](https://supabase.com/docs/guides/auth/general-configuration)
3. Verificare progetto, URL e connessione prima di creare il marker. Dopo approvazione applicare dal SQL Editor **del solo progetto di staging**, sostituendo il placeholder con il ref verificato. Un eventuale ruolo PostgreSQL di probe può avere soltanto USAGE su `dashboard_private` e SELECT sul marker, distinto dai ruoli web.

```sql
BEGIN;
CREATE TABLE dashboard_private.staging_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  project_ref text NOT NULL CHECK (project_ref ~ '^[a-z0-9]{20}$')
);
REVOKE ALL ON dashboard_private.staging_identity FROM PUBLIC, anon, authenticated;
INSERT INTO dashboard_private.staging_identity (project_ref) VALUES ('<REF_STAGING_VERIFICATO>');
COMMIT;
```

4. Impostare le variabili in una shell PowerShell 7 dedicata. Il toolkit legge l’ambiente del processo. Usare la [configurazione di esempio](../tools/.env.example) per i nomi e proteggere segreti e DSN completo da cronologia, argv, log e Git. Il DSN diretto usa `host=db.<ref>.supabase.co port=5432 dbname=postgres user=<ruolo> password=<segreto> sslmode=verify-full sslrootcert=<percorso-CA>`, con quotatura libpq per spazi. Impostare il percorso CA assoluto anche in `GCH_STAGING_DB_CA_FILE`. In alternativa usare `sslrootcert=system` quando la CA è riconosciuta da OpenSSL. Avviare il toolkit senza variabili libpq `PG*` per evitare sovrapposizioni.

```powershell
$env:GCH_TARGET = 'staging'
$env:GCH_STAGING_PROJECT_REF = Read-Host 'Ref staging verificato'
$env:GCH_PRODUCTION_PROJECT_REF = Read-Host 'Ref produzione verificato'
$env:GCH_STAGING_SUPABASE_URL = "https://$($env:GCH_STAGING_PROJECT_REF).supabase.co"
$env:GCH_STAGING_DB_CA_FILE = Read-Host 'Percorso assoluto della CA'
$env:GCH_STAGING_DATABASE_URL = Read-Host -MaskInput 'DSN diretto staging completo'
$env:GCH_STAGING_SUPABASE_PUBLISHABLE_KEY = Read-Host -MaskInput 'Chiave publishable staging'
$env:GCH_STAGING_ALLOWED_EMAIL = Read-Host -MaskInput 'Email autorizzato'
$env:GCH_STAGING_ALLOWED_PASSWORD = Read-Host -MaskInput 'Password autorizzato'
$env:GCH_STAGING_DENIED_EMAIL = Read-Host -MaskInput 'Email fuori allowlist'
$env:GCH_STAGING_DENIED_PASSWORD = Read-Host -MaskInput 'Password fuori allowlist'
```

### 2. Installazione e upgrade

- **Installazione nuova.** Eseguire come amministratore, un file alla volta, `supabase/bootstrap.sql`, `supabase/dashboard.sql`, `supabase/migrations/0034_data_intelligence.sql` e `supabase/migrations/0035_staging_reliability.sql`. Dopo dashboard configurare allowlist e marker. Verificare il progetto selezionato prima di ogni operazione.
- **Upgrade da V3.3.** Preparare bootstrap e dashboard in un ambiente sintetico separato, creare marker e allowlist, popolare con `--legacy` e provare backup/restore prima di applicare 0034 e 0035. Salvare le verifiche prima di 0034, dopo 0034 e dopo 0035.
- **Upgrade da V3.4.** Fermare i writer. Preparare un archivio sintetico con la fixture `--legacy` su schema 34. Prima del backup, inserire un successo V3.4 in `coaching.import_coverage` con `attempt_state=evidence='success_with_data'`, timestamp valorizzati, conteggio >0 e `quality='validated'`. Fare backup, eseguire le query e applicare solo 0035. La riga precedente conserva la prova e ottiene `reconciliation` nulla. Ripetere 0035 e confrontare definizioni, ACL e conteggi. In un DB sintetico separato provare una copia del file con l'ultimo `COMMIT;` sostituito da `SELECT 1/0; COMMIT;` prima della prima applicazione. Dopo rollback le nuove colonne devono essere assenti. La suite locale include già questa prova.
- Generare la fixture da revisionare con il comando seguente. Per il percorso legacy aggiungere `--legacy`. Il generatore valida la configurazione e genera SQL offline. Rileggere il file e il progetto selezionato prima dell’applicazione manuale. L’SQL verifica marker e archivio vuoto. Usare database vuoti separati per provare entrambe le dimensioni.

```powershell
python -X utf8 -m tools.staging_fixture --target staging --reference 2024-03-05 --size large |
  Set-Content -Encoding utf8NoBOM .cache/v341-staging.sql
```

Se PostgREST non vede le RPC appena installate, eseguire `NOTIFY pgrst, 'reload schema';` dal SQL Editor di staging e ripetere il probe.

#### Query di verifica

```sql
SHOW server_version;
SELECT count(*) AS attivita, min(activity_date), max(activity_date) FROM coaching.garmin_activities;
SELECT count(*) AS giorni, min(metric_date), max(metric_date) FROM coaching.garmin_daily_metrics;
SELECT count(*) AS allowlist FROM dashboard_private.allowed_users;
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS firma,
       md5(pg_get_functiondef(p.oid)) AS definizione, p.prosecdef, p.proconfig,
       pg_get_userbyid(p.proowner) AS proprietario, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('dashboard_data','dashboard_metadata_v2',
         'dashboard_activities_v2','dashboard_daily_v2','dashboard_coverage_v2'))
   OR (n.nspname IN ('coaching','dashboard_private') AND p.prokind='f')
ORDER BY 1,2,3;

-- Da 0034 in avanti
SELECT schema_version, revision FROM coaching.intelligence_state;
SELECT source, attempt_state, count(*) FROM coaching.import_coverage GROUP BY 1,2 ORDER BY 1,2;

-- Dopo 0035
SELECT source, reconciliation, count(*) FROM coaching.import_coverage GROUP BY 1,2 ORDER BY 1,2;
SELECT has_function_privilege('anon','public.dashboard_metadata_v2(text,text)','EXECUTE') AS anon_rpc,
       has_function_privilege('authenticated','public.dashboard_metadata_v2(text,text)','EXECUTE') AS auth_rpc,
       has_schema_privilege('authenticated','coaching','USAGE') AS auth_coaching,
       has_table_privilege('authenticated','coaching.import_coverage','SELECT') AS auth_coverage;
```

Attesi schema 34, ACL `false/true/false/false`. In upgrade conteggi e date originari coincidono. Rispetto a 0034 cambiano metadata, coverage V2 e l’attributo definer del trigger revisione. Legacy, attività e giornate V2 conservano gli hash. Alla riapplicazione dati e ACL coincidono. Per il writer minimo, con approvazione e ruolo dedicato già creato, applicare i grant sotto. Usare un solo writer alla volta, con connessione diretta o pooling di sessione verificato per il lock di sessione.

```sql
GRANT USAGE ON SCHEMA coaching TO garmin_writer;
GRANT SELECT,INSERT,UPDATE ON coaching.garmin_activities, coaching.garmin_daily_metrics,
  coaching.import_coverage TO garmin_writer;
GRANT SELECT ON coaching.intelligence_state TO garmin_writer;
```

### 3. REST e Auth

Eseguire `python -m tools.staging_probe --fixture-size large` dopo il fresh install con fixture grande. Usare `small` per la fixture ridotta oppure omettere l’opzione per verificare l’upgrade senza asserire le quantità esatte del fresh install. L’accesso SQL è in sola lettura e verifica progetto, TLS e marker prima di HTTP. Le richieste Auth aprono, aggiornano e chiudono soltanto sessioni degli utenti sintetici. Il report mostra conteggi aggregati e verifica anon, utente fuori allowlist, utente autorizzato, accesso diretto negato, legacy, tre collezioni paginate, conteggi, cursori, bigint e revisione obsoleta. Una chiave publishable è sufficiente insieme al JWT dei singoli account. [Chiavi Supabase](https://supabase.com/docs/guides/getting-started/api-keys) · [Errori PostgREST](https://docs.postgrest.org/en/stable/references/errors.html)

Per la prova di revisione con mutazione reale, ottenere approvazione distinta. Avviare `python -m tools.staging_probe --verify-revision-change`. Durante la pausa aggiornare una sola attività sintetica dal SQL Editor del progetto verificato, sostituendo il placeholder. Attesa una riga aggiornata. Il probe verifica SQLSTATE `40001` sulla revisione obsoleta e rilegge i dati con nuova revisione.

```sql
UPDATE coaching.garmin_activities SET synced_at=clock_timestamp()
WHERE activity_id=9007199254740993 AND raw_data #>> '{summary,activityName}' = 'Attività sintetica'
  AND (SELECT array_agg(project_ref) FROM dashboard_private.staging_identity)
       = ARRAY['<REF_STAGING_VERIFICATO>'];
```

### 4. Dashboard locale

Dopo il probe avviare il frontend con lo stesso target verificato. Impostare le sole variabili browser dalla configurazione dedicata. Usare un profilo browser di test.

```powershell
$env:VITE_SUPABASE_URL = $env:GCH_STAGING_SUPABASE_URL
$env:VITE_SUPABASE_PUBLISHABLE_KEY = $env:GCH_STAGING_SUPABASE_PUBLISHABLE_KEY
$env:VITE_GARMIN_TIMEZONE = 'Europe/Rome'
Set-Location dashboard
npm ci
npm run dev -- --host 127.0.0.1 --strictPort
```

A 1440, 375 e 390 px provare login, utente fuori allowlist, logout durante una pagina in volo e login col secondo account. L’archivio precedente deve sparire subito e le risposte tardive vanno scartate. In V2 verificare 2.502 attività e 2.501 giornate per la fixture grande, conflitto con record conservati, zero riconciliato, giorno corrente parziale, data bisestile, piano di 31 giorni, grafici, tooltip, assi e linea 1× quando disponibile. Controllare le somme parziali e i confronti omessi in Training Load, Advanced Load ed export Markdown. Per fallback provare prima di 0034 nell’ambiente di upgrade. Solo la funzione metadata assente attiva legacy. Provare 403, timeout e retry senza vista incompleta. Con throttling e mutazione autorizzata verificare un solo riavvio su revisione cambiata e annullamento su cambio intervallo. Chiudere le shell con credenziali al termine.

### 5. Backup e ripristino Supabase

Prima della migrazione usare `pg_dump` e `pg_restore` compatibili col server, preferibilmente dello stesso major. Da una shell di manutenzione separata verificare host e marker. Usare `PGSSLMODE=verify-full`, `PGSSLROOTCERT` e password digitata al terminale con `-W`. Proteggere il percorso di backup fuori Git o in `backups/`.

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = $env:GCH_STAGING_DB_CA_FILE
pg_dump --host "db.$($env:GCH_STAGING_PROJECT_REF).supabase.co" --port 5432 --username postgres -W --format=custom --schema=coaching --schema=dashboard_private --schema=public --exclude-table-data=dashboard_private.allowed_users --file=backups/v341-staging.dump postgres
pg_restore --list --file=backups/v341-staging.toc backups/v341-staging.dump
```

Controllare nella TOC dati coaching, schemi, RPC applicative in `public`, funzioni, ACL e trigger. In una copia della lista commentare con `;` oggetti estranei e creazione di uno schema pubblico già presente. Conservare RPC legacy e V2 e dipendenze. Escludere i dati del marker quando si ripristina verso un’altra identità DB. Conservare a parte l’inventario protetto di account sintetici, relazione con allowlist, ruoli e proprietari. I ruoli globali e gli utenti Auth gestiti richiedono una procedura separata. Ricreare gli utenti sul target e la relativa allowlist con i nuovi UUID, quindi verificare login. Escludere password e token dall’inventario.

Ripristinare con `pg_restore --use-list=backups/v341-staging-reviewed.toc --exit-on-error --single-transaction --dbname=<DB_ISOLATO> backups/v341-staging.dump` su una seconda destinazione isolata, dopo aver predisposto ruoli e dipendenze. In locale con stub servono `anon`, `authenticated`, `auth.users` e `auth.uid()`. Se i principal gestiti differiscono, documentare la mappatura e ripetere verifica ACL e ownership. Confrontare conteggi, estremi delle date, definizioni, accessi e RPC. Per rollback applicativo ripristinare bundle e writer compatibili mantenendo schema esteso. Le scritture legacy invalidano le evidenze toccate.

### 6. Garmin autorizzata

Su approvazione separata scegliere da uno a tre giorni chiusi. Usare staging dedicato, concordare il minimo dei dati necessari e rispettare quote e retry. Confrontare manualmente date civili, tipi, distanze, durate, cadenza, dislivelli, zone e misure disponibili. Registrare esiti e unità senza payload, dati personali, ID o segreti. VO₂max, sequenza lap e durata pause restano indisponibili finché il contratto reale è verificato.

## Checklist dei gate

| Prerequisito | Azione | Atteso | Evidenza senza segreti | Stato |
| --- | --- | --- | --- | --- |
| Cluster loopback vuoto | Suite SQL e restore locale | Fresh, upgrade, rollback e ripristino | Conteggi, hash, ACL | Verificato localmente |
| Release locale | Suite dashboard/Python e audit | Regressioni e nuovi casi passano, chunk <500 kB | Report | Verificato localmente |
| Approvazione pubblicazione | Push separato e CI per SHA | Job dashboard, Python e PostgreSQL | URL Actions e SHA | Richiede utente |
| Progetto e approvazione separati | Fresh, upgrade e fixture nel progetto verificato | Installazione additiva e rerun | Conteggi e ACL | Richiede utente |
| Marker, utenti e fixture | Probe e frontend | Accessi, pagine, revisione, cambio account e layout | Verbale sintetico | Richiede staging |
| Approvazione mutazione sintetica | Probe con revisione cambiata | `40001` e ripresa con nuova revisione | Esito e revisione | Richiede utente |
| Restore separato | Dump custom, TOC e ripristino | Conteggi, ACL, Auth ricreato | Verbale restore | Richiede staging |
| Approvazione Garmin | Verifica 1–3 giorni | Contratti e unità verificati | Riepilogo minimizzato | Richiede utente |
