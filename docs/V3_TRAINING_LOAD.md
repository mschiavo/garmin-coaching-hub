# V3 Training Load — integrazione beta

## Installazione

1. Crea il branch `feature/v3-training-load` a partire da `main` (non dal branch beta Community Edition).
2. Copia `dashboard/src/trainingLoad.ts` e `tools/apply_v3_training_load.py` nelle cartelle corrispondenti del repository.
3. Esegui dalla radice: `python tools/apply_v3_training_load.py`.
4. Esegui `cd dashboard`, `npm install`, `npm run build`.
5. Verifica visivamente la nuova voce **Training Load**, poi fai commit e push sul branch.

Il patcher è idempotente e verifica i punti di inserimento prima di scrivere. Non esegue migrazioni SQL e non modifica i workflow Garmin.

## Interpretazione

Il rapporto confronta i km dell'ultima settimana **completata** con la media delle 4 settimane precedenti. Se mancano 4 settimane all'interno del periodo selezionato o la media è zero, mostra `—`. Le settimane senza corsa sono rappresentate con zero. La settimana corrente è inclusa nei grafici, ma esclusa dai KPI di confronto.

**Limiti:** chilometri e durata sono proxy descrittivi del volume, non un carico fisiologico. Non dedurre rischio di infortunio o stato di forma dal rapporto. L'archivio RPC attuale limita le attività a 2000 righe: lo storico può essere troncato.

## Nota tecnica

Questa è una integrazione sorgente da compilare e verificare localmente: non è ancora stata pubblicata né validata con un account Garmin reale.
