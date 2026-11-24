# Installazione e upgrade V3.4

Per V3.4.1, seguire il [runbook dedicato](V3_4_1_STAGING_RUNBOOK.md) e applicare 0035 dopo 0034. L’estensione conserva schema 34 e API V2.

Eseguire questo percorso in staging con progetto separato e fixture sintetiche. L’installazione è personale e il database di staging deve avere utenti, allowlist e credenziali distinti dalla produzione.

## Ordine dei file da revisionare

1. Per installazione nuova eseguire `supabase/bootstrap.sql`, quindi `supabase/dashboard.sql`. In upgrade, verificare che tabelle, ruolo proprietario e RPC legacy corrispondano a quelli della V3.3. Applicare bootstrap e dashboard solo nella procedura di installazione nuova.
2. In upgrade, preparare un backup con `pg_dump --format=custom` dei dati e dello schema applicativo, e includere una procedura di ripristino per utenti e allowlist secondo la configurazione Supabase. Proteggere il backup come dato sanitario. Verificare `pg_restore --list` e provare il ripristino su un database separato, poi confrontare conteggi, estremi di date, definizione e privilegi della RPC legacy.
3. Revisionare e applicare `supabase/migrations/0034_data_intelligence.sql` con ruolo amministrativo. La migrazione transazionale richiede PostgreSQL 14 o più recente per `CREATE OR REPLACE TRIGGER`. La suite usa PostgreSQL 17. In upgrade pianificare una finestra senza import concorrenti. Verificare il ricaricamento dello schema PostgREST se i nuovi endpoint non sono visibili.
4. Verificare le query successive e i ruoli. Se si usa un writer PostgreSQL dedicato con accesso già configurato a entrambe le tabelle Garmin, aggiungere solo i privilegi indicati sotto. Configurare un account di test in Auth e aggiungerlo all’allowlist.
5. Provare la dashboard V3.3 sul database migrato e la V3.4 prima su schema legacy, poi su schema migrato. Il fallback permette di aggiornare l’app prima della migrazione. L’ordine preferito per staging è database, writer, app. Aggiornare il writer una volta terminata ogni esecuzione legacy in corso.

```sql
SELECT schema_version, revision FROM coaching.intelligence_state;
SELECT to_regprocedure('public.dashboard_data()'),
       to_regprocedure('public.dashboard_metadata_v2(text,text)');
SELECT source, attempt_state, count(*)
FROM coaching.import_coverage GROUP BY source, attempt_state;
SELECT has_function_privilege('anon', 'public.dashboard_metadata_v2(text,text)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.dashboard_metadata_v2(text,text)', 'EXECUTE'),
       has_schema_privilege('authenticated', 'coaching', 'USAGE');
```

Gli ultimi tre valori attesi sono false, true, false. Per il writer già predisposto, sostituire `garmin_writer` con il proprio ruolo di login e applicare solo le istruzioni pertinenti.

```sql
GRANT USAGE ON SCHEMA coaching TO garmin_writer;
GRANT SELECT, INSERT, UPDATE ON coaching.garmin_activities, coaching.garmin_daily_metrics,
  coaching.import_coverage TO garmin_writer;
GRANT SELECT ON coaching.intelligence_state TO garmin_writer;
GRANT UPDATE (revision) ON coaching.intelligence_state TO garmin_writer;
```

La revisione è un metadato interno e al writer è affidato l’aggiornamento via trigger. Il ruolo writer va tenuto separato dai ruoli web. Una connessione con pooling di transazione non è adatta all’advisory lock di sessione.

## Collaudo prima della produzione

- Con due database PostgreSQL di test vuoti `v34_fresh` e `v34_upgrade` su loopback, impostare `V34_TEST_DSN` verso l’istanza isolata ed eseguire `python -m unittest discover -s tests/sql -v`. Il test installa uno stub Auth, fixture e schema. Ricreare i database sintetici per ripetere la prova.
- In Supabase separato, ripetere installazione e upgrade con dati sintetici e verificare REST, JWT, cache di schema, anon, authenticated fuori allowlist e utente autorizzato. Confrontare conteggi legacy e V2, paginare oltre 2.000 e aggiornare una riga sintetica tra due pagine. Verificare il retry e la visibilità della revisione.
- Verificare entrambi i fusi, calendario bisestile e margini del periodo. Controllare su desktop e mobile Qualità dei dati, fonti parziali, zeri attestati e download del piano. Eseguire le prove del writer contro client mock e verificare esiti di commit e ripresa.
- In un secondo collaudo autorizzato e separato, verificare risposte Garmin con un piccolo intervallo, entrate e uscite dal giorno civile, validazione metrica, record legacy e comportamento in caso di quota. Confermare campo e unità dei valori opzionali prima di usare gli indicatori su dataset personali.

## Rollback applicativo

Ripristinare i bundle e i writer V3.3 dall’artefatto verificato. Conservare lo schema additivo, le evidenze di copertura e il backup verificato. La firma e i permessi di `dashboard_data()` permettono la lettura con la V3.3. I writer V3.3 aggiornano le tabelle storiche e incrementano la revisione finché i trigger sono attivi. Prima di tornare alla V3.4, verificare di nuovo la copertura delle giornate toccate dai writer V3.3. Una eventuale procedura SQL di rollback richiede uno script separato e revisionato con conservazione dei metadati. Il rollback applicativo non richiede una migrazione inversa.
