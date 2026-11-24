# V3.4.1 Staging & Reliability

La [migrazione 0035](../supabase/migrations/0035_staging_reliability.sql) estende lo schema 34. Il numero SQL è sequenziale. Le cinque firme RPC restano utilizzabili. I metadati V2 aggiungono `reliability_version: 1`. Le pagine di copertura aggiungono `reconciliation`, `observed_count` e `missing_count`.

| Dimensione | Persistenza | Interpretazione |
| --- | --- | --- |
| Ultima evidenza acquisita | `evidence`, `succeeded_at`, `item_count`, `quality` | Ultima acquisizione conclusa con dati o ricerca attività vuota. Un errore successivo conserva questi campi. |
| Ultimo tentativo | `attempt_state`, `attempted_at`, `error_code` | Esito più recente, incluso tentativo iniziato, incompleto, fallito o privo di misure valide. |
| Concordanza | `reconciliation`, `observed_count`, `missing_count` | Esito e conteggi dell’ultima riconciliazione nella tabella privata `coaching.import_coverage`. La RPC espone gli aggregati. |

Il frontend distingue **verificata**, **storica**, **in conflitto**, **parziale** e **sconosciuta**. Uno spostamento, una modifica legacy o un insieme discordante richiedono verifica mirata. Il giorno corrente è parziale nel fuso Garmin. Le giornate V3.4 prive di riconciliazione restano storiche se hanno evidenza. Quelle senza tentativo restano sconosciute. Il trasferimento V2 verifica revisione, cursori e quantità di righe. Il Centro Qualità mostra separatamente concordanza, ultimo tentativo, ultima evidenza, righe in archivio e conteggi all’ultima riconciliazione.

I confronti di carico e del report richiedono giornate concluse, copertura verificata, coerenza tra righe ricevute ed evidenza e misure valide per la metrica coinvolta. L’efficienza richiede anche i campioni minimi e misure valide di distanza, durata e FC. Le somme registrate restano visibili come parziali e le formule sportive restano quelle di V3.4. Il recupero mostra presenza e numerosità delle misure, con copertura consultabile per fonte.

## Scrittura e compatibilità

La ricerca offset Garmin valida struttura, cardinalità e ID bigint e rifiuta anche duplicati identici. Dopo una scansione multipagina ricontrolla la prima pagina e mantiene il limite di 5.000 posizioni. Sovrapposizione, cambio della prima pagina, risposta anomala, limite raggiunto o dettaglio indisponibile fanno fallire la finestra prima degli upsert. Un cambiamento confinato alle pagine successive può restare invisibile, perché la ricerca non ha uno snapshot. `startTimeLocal` fornisce la data civile dell’attività. La chiusura della giornata usa `GARMIN_TIMEZONE` lato writer e `VITE_GARMIN_TIMEZONE` lato browser, entrambi Europe/Rome di default. I timestamp di tentativo e successo sono `timestamptz`.

L’acquisizione registra il tentativo pendente prima della rete. Upsert, confronto esatto degli ID osservati con quelli archiviati nella finestra e attestazione avvengono nello stesso commit. Il writer conserva scalari validi dello stesso ID. La mancanza di distanza o durata nell’ultima acquisizione di una corsa mantiene parziale la giornata. Le attività assenti dalla risposta restano visibili. Un cambio di data invalida entrambe le giornate coinvolte. Un arresto dopo il tentativo conserva l’evidenza in stato parziale. Se il commit fallisce, upsert e attestazione sono annullati e il writer tenta di registrare il fallimento in una nuova transazione.

INSERT, UPDATE, DELETE e TRUNCATE invalidano la copertura interessata. Per le misure giornaliere il trigger valuta il cambio data e le colonne delle singole fonti. Un nuovo successo scritto in modalità V3.4 azzera una precedente attestazione. Il writer V3.4.1 la riscrive nella transazione di salvataggio. Il lock di sessione `340034` impedisce import recenti, storici e riparazioni sovrapposti. Il lock di transazione `340035` serializza la riconciliazione con le mutazioni legacy senza estendersi alla rete. La scansione legge gli ID della sola finestra richiesta e usa l’indice per data. I trigger per riga verificano le chiavi di copertura coinvolte. Revisione e lock condivisi aumentano la contesa. Eseguire manutenzione e migrazioni a writer fermi.

Le RPC usano `SECURITY DEFINER`, `search_path` vuoto, `auth.uid()` e allowlist. Le funzioni interne di revisione e invalidazione sono eseguibili solo come trigger. Un writer V3.3 può aggiornare l’archivio senza grant sulla copertura. Il bundle V3.4 usa ancora la politica di confronto V3.4. Il frontend V3.4.1 applica una politica conservativa quando manca la capability e passa a legacy solo per RPC metadata mancante. Logout e cambio account annullano le letture e rimuovono l’archivio dallo stato applicativo. Il build rifiuta chiavi Supabase elevate nel parametro browser.

## Contratto operativo

| Codice | Esito |
| --- | --- |
| 0 | Import senza errori tecnici o divergenze. Può includere giorno corrente, giornate prive di misure e sorgenti con alcune misure valide. |
| 2 | Esito tecnico parziale con altri esiti utilizzabili, oppure divergenza di riconciliazione. |
| 1 | Fallimento senza esiti utilizzabili, incluso lock indisponibile o configurazione errata. |

Sync, storico e riparazione condividono un riepilogo JSON aggregato per fonte e numero di giornate, con quantità salvate, inserite, aggiornate, spostate, non restituite, errori transitori e altri errori, e retry. Gli status HTTP conservano il proprio codice osservato. I tentativi sono al massimo quattro. Il writer rispetta `Retry-After` quando esposto e rinuncia se l’attesa richiesta supera 120 secondi. Una quota 429 esaurita interrompe il job. Il client fissato può omettere gli header. I log e il riepilogo Actions usano codici sanitizzati.

`repair_garmin.py AAAA-MM-GG AAAA-MM-GG` produce il piano in sola lettura per un massimo di 31 giorni. Su schema esteso include tentativi falliti, evidenze solo storiche, conflitti e invalidazioni. `--execute` abilita l’import selettivo con configurazioni operative autorizzate. Il Centro Qualità esporta data e fonte per ogni lacuna. Per il collaudo seguire il [runbook](V3_4_1_STAGING_RUNBOOK.md).
