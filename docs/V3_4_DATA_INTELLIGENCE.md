# V3.4 Data Intelligence

La dashboard personale legge l’archivio attraverso Supabase Auth e la propria allowlist. I dati delle RPC V2 rimangono in memoria e vengono scartati al cambio di sessione. Il client usa esclusivamente la chiave pubblicabile. L’allowlist autorizza l’accesso all’archivio dell’installazione. Ogni persona deve avere il proprio progetto.

## API

Tutti gli intervalli usano date civili ISO YYYY-MM-DD inclusive. Dimensione predefinita 250, da 1 a 500. Ogni RPC verifica l’utente e l’allowlist a ogni invocazione.

| RPC | Parametri e risultato |
| --- | --- |
| `dashboard_metadata_v2` | `p_start`, `p_end` opzionali, con default 0001-01-01 e 9999-12-31. Restituisce `api_version=2`, `schema_version=34`, `revision` come stringa decimale, `updated_at`, anomalie per attività e giornate e, per ciascuna collezione, min/max globali e conteggio nell’intervallo. `coverage_status` vale `unknown` quando il periodo non ha metadati e `available` quando ne contiene. |
| `dashboard_activities_v2` | `p_start`, `p_end`, `p_revision`, `p_limit`, `p_after_date` e `p_after_key` opzionali come coppia. Ordine per data e ID numerico. ID bigint positivo serializzato come stringa sia nei dati sia nel cursore. |
| `dashboard_daily_v2` | Stessi parametri pagina, con il solo `p_after_date` come cursore. Ordine per data. Normalizza sonno in ore, HRV in ms, FC a riposo in bpm, stress e Body Battery in punti e passi in unità. |
| `dashboard_coverage_v2` | Cursore data e sorgente. Ordine per data e sorgente con collazione C. Ogni riga contiene stato e ora dell’ultimo tentativo, evidenza precedente, ora dell’ultimo successo, conteggio, qualità e codice sanitizzato. |

Le pagine espongono `revision`, `limit`, `count`, `rows`, `has_more` e `next_cursor` (nullo all’ultima pagina). Il cursore di attività e copertura contiene `date` e `key`. Il cursore giornaliero contiene solo `date`. Le righe con attività senza data civile rappresentabile o ID positivo e le giornate con data non rappresentabile compaiono nei conteggi di anomalia. I campi metrici fuori intervallo sono nulli. L’API V2 consegna proiezioni esplicite prive di tracciati e payload originali.

I trigger di statement incrementano la revisione nella stessa transazione di ogni modifica alle collezioni, anche con writer legacy. Una RPC STABLE legge revisione e righe dallo stesso snapshot della singola invocazione. Tra invocazioni il client riavvia il trasferimento una sola volta su SQLSTATE 40001. La copertura dell’archivio è distinta dal trasferimento verificato per ordine, cursori e conteggi. L’identità della revisione presuppone trigger attivi e DML ordinario. Scritture con bypass dei trigger, modifiche DDL e ripristini amministrativi richiedono una finestra di manutenzione.

Il frontend prova la legacy esclusivamente su assenza della RPC metadati (404 con PGRST202 o 42883). Limite legacy di 2.000 righe per collezione e copertura sconosciuta. L’intervallo V2 usa il giorno civile del fuso Garmin, configurabile con `VITE_GARMIN_TIMEZONE` (predefinito Europe/Rome), da allineare al writer `GARMIN_TIMEZONE`. Le finestre finite acquisiscono almeno 56 giorni aggiuntivi e, per i confronti di pari durata, fino al doppio del periodo. Per lo storico completo l’inizio è la prima data disponibile. Limiti operativi di 100.000 righe per collezione e 15.001 giorni visibili. In caso di superamento, selezionare una finestra più breve.

## Coverage e writer

Giorno per sorgente (attività, sonno, HRV, Body Battery, stress e riepilogo). L’assenza di una riga indica `unknown`. L’ultimo tentativo può essere `partial`, `failed`, `success_with_data`, `success_empty` o `unsupported`. Il client 1.1.0 non fornisce un segnale sufficiente per attestare `unsupported`. Le cinque fonti giornaliere vuote rimangono parziali. Uno zero attività attesta una ricerca terminata e vuota per un giorno passato. Il conteggio osservato deve coincidere con l’evidenza per usare il giorno nei confronti. Il giorno corrente rimane parziale.

Il writer registra l’inizio come parziale. Dati e successo vengono committati insieme per intervallo di attività o per singola misura. Un fallimento viene registrato dopo il rollback. L’evidenza del successo precedente sopravvive. La qualità descrive l’evidenza e l’ora dell’ultimo successo permette di valutarne la freschezza. La presenza di una riga giornaliera legacy è un’osservazione, con copertura sconosciuta.

Per il giornaliero si conservano le misure quando la risposta è nulla, vuota o fallisce. Una risposta parziale aggiorna solo i dati disponibili e riporta dal payload precedente gli scalari già validati nei percorsi esplicitamente autorizzati. Per le attività si preservano allo stesso modo le misure normalizzate preesistenti se una nuova risposta perde quei valori. Eventuali altri campi provengono dall’ultimo payload accettato. La ricerca attività usa 50 righe per pagina e un limite di sicurezza di 5.000. Il dettaglio mancante o incoerente interrompe il blocco attività. Il writer non cancella attività assenti al recupero.

Gli script condividono un advisory lock di sessione e devono usare una connessione con sessione dedicata (diretta o pooler in modalità sessione). Il lock evita sovrapposizioni tra cron, import e recupero V3.4. I writer V3.3 attivano i trigger di revisione ma non acquisiscono il lock e non aggiornano la copertura. Evitare esecuzioni sovrapposte durante l’upgrade. Il retry ha massimo quattro tentativi per richiesta su 408/429/5xx selezionati e errori di connessione. Il client 1.1.0 espone il codice HTTP e non gli header, quindi il 429 usa attese di 10, 20 e 40 secondi. Il 401 e il 403 non vengono ritentati. In schema V3.3, l’import mensile salta singole fonti con misure valide e la sincronizzazione recente preserva i valori validi. L’import mensile V3.4 riprende per data e fonte su blocchi di sette giorni.

`python repair_garmin.py 2024-02-01 2024-02-29` stampa il piano in una transazione di sola lettura e non contatta Garmin. L’esecuzione richiede `--execute`, variabili configurate dall’operatore e massimo 31 giorni per invocazione. Il centro Qualità dei dati esporta solo data e sorgente per gli ultimi 31 giorni visibili e non espone un accesso al writer.

## Audit delle metriche estese

Audit del wheel installato `garmin-connect-personal-api-python==1.1.0` e delle risposte OpenAPI 1.0.0 pubblicate da Garmin. `search_activities` restituisce `SummarizedActivityDTO`, già archiviato in `raw_data.summary`. `get_activity` restituisce `ActivitySummaryDTO`, già archiviato in `raw_data.detail`. I limiti seguenti filtrano errori di qualità grossolani. La copertura di ogni campo dipende da profilo, sensore e registrazione. [Garmin Personal API 1.1.0](https://pypi.org/project/garmin-connect-personal-api-python/1.1.0/) · [Specifiche OpenAPI Garmin](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/)

| Indicatore | Percorso e unità | Disponibilità e limiti |
| --- | --- | --- |
| Dislivello positivo e negativo | `summary.elevationGain/elevationLoss`, fallback `detail.summaryDTO.elevationGain/elevationLoss`, m | 0–60.000 m ciascuno. Dipende dalla misura e dalla correzione Garmin. |
| Cadenza media di corsa | `summary.averageRunningCadenceInStepsPerMinute`, fallback `detail.summaryDTO.averageRunCadence`, passi/min | 1–300. Il campo esplicito è già in passi/min, senza conversione. |
| Potenza media | `detail.summaryDTO.averagePower`, W | 0–4.000. Se il sensore o la stima Garmin mancano, il valore è nullo. |
| Temperatura media | `detail.summaryDTO.averageTemperature`, °C | −90–70. Descrive la registrazione del dispositivo, con possibili influenze da corpo, luce e ambiente. |
| Split Garmin sui 1.000 m | `summary.fastestSplit_1000`, s | 60–86.400. È l’aggregato restituito da Garmin. `splitSummaries` comprende aggregati per tipo e non fornisce una sequenza di lap verificata per questa release. |
| Tempi in zona FC | `summary.hrTimeInZone_1` fino a `_5`, s | 0–864.000 a campo. Sono tempi registrati con le zone Garmin dell’attività. Le soglie individuali e la loro validità nel tempo non sono dedotte. |
| VO₂max | `summary.vO2MaxValue`; endpoint giornaliero `/metrics-service/metrics/maxmet/daily/{startDate}/{endDate}` | Il campo activity esiste ma il contratto consultato non dichiara l’unità. L’endpoint giornaliero è presente nel client e non è acquisito dai writer. |
| Pause | `summary.elapsedDuration`, `summary.duration`, `summary.movingDuration`, s | Le durate sono disponibili teoricamente. Il contratto non documenta una durata autonoma delle pause o una formula per ricavarla senza includere altri tempi. |

## Analytics

Il recupero mostra la differenza assoluta anche con mediana zero, con percentuale solo se la mediana è positiva. La data della rilevazione e il conteggio distinguono misure recenti e storiche. Le soglie restano 14 misure su 28 giorni per riferimento personale e 4 su 7 per mediana mobile.

Il carico avanzato usa i sette giorni conclusi e i 28 immediatamente precedenti divisi per quattro. Le viste settimanali confrontano settimane di calendario concluse. Copertura attività e misure valide sono condizioni distinte. Le somme parziali riportano quanti valori contribuiscono. Giornate ancora in corso, distanze mancanti e riferimenti pari a zero impediscono il rapporto. Il report Markdown usa lo stesso contenuto della vista. Le finestre di efficienza conservano coorti e numerosità e indicano confronti provvisori quando manca evidenza di copertura. L’identità della prestazione selezionata e la conferma esplicita governano le proiezioni Riegel. Gli split aggregati non entrano nella stima.
