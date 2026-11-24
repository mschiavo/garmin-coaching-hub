# Garmin Coaching Hub — V3.1.2 Cartesian Charts

## Ambito
Revisione **di tutti i grafici Recharts**, non solo Training Load. Il componente `Plot` è condiviso tra Panoramica, Allenamenti, Recupero, Prestazioni e Insights; `LoadChart` gestisce i quattro grafici Training Load. Calendario e archivio attività non sono grafici cartesiani e non vengono modificati.

## Cambiamenti
- Assi X e Y visibili con tacche, valori e unità di misura per ciascun grafico.
- Scala Y da zero per volume, conteggi, durata e passi; scala automatica per FC, HRV e ritmo.
- Legenda con nomi delle serie, griglia orizzontale, tooltip standard Recharts.
- Ritmo vs FC: scatter con X in secondi/km e Y in bpm.
- Training Load: date settimanali sull'asse X, unità sull'asse Y; legenda settimane incomplete visibile solo quando presenti, con date precise; barre incomplete grigie, semitrasparenti e tratteggiate.
- Le linee delle settimane incomplete non cambiano colore: l'incompletezza è indicata dalla legenda datata e dal selettore di dettaglio.

## Installazione
Sul branch `feature/v3-training-load`, con V3.1.1 già installata, estrarre lo ZIP nella radice e avviare:

```powershell
python tools/apply_v312_cartesian_all_charts.py
cd dashboard
npm run build
npm run dev
```

Lo script crea backup `main.tsx.pre-v312.bak` e `style.css.pre-v312.bak` (non committarli). È idempotente. Non modifica Supabase, GitHub Actions o i segreti.

## Checklist manuale
- Panoramica: volume settimanale, frequenza, HRV e sonno.
- Allenamenti: chilometri, ore, corse, volume mensile, fasce di distanza.
- Training Load: 4 grafici, settimane, legenda incompleta solo se applicabile.
- Recupero: HRV, sonno, FC, stress, Body Battery, passi e aggregazioni mensili.
- Prestazioni: ritmo, FC, scatter ritmo/FC e FC settimanale.
- Insights: volume, HRV, FC e sonno mensili.
- Provare il mouse su un punto e il ridimensionamento della finestra.

## Limiti noti
- La prima settimana può aggregare corse precedenti al filtro selezionato: è una proprietà del motore Training Load esistente e va corretta in un intervento successivo.
- Il componente Training Load considera come ultima data quella più recente disponibile nel payload; se i dati non sono aggiornati, la settimana finale può sembrare completa anche se la sincronizzazione è in ritardo.
- Il tooltip è gestito da Recharts: la build non prova da sola che gli eventi mouse funzionino nel browser dell'utente.
- La dashboard non fornisce ancora etichette di tutte le date quando ci sono molti punti: Recharts riduce le tacche per evitare sovrapposizioni, il dettaglio compare nel tooltip.
