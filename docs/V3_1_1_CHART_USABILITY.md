# V3.1.1 — Chart Usability Fix

Questo aggiornamento richiede V3.1 già applicata. Non modifica Supabase, sincronizzazione o branch Community Edition.

## Installazione

1. Copia la cartella `tools` dello ZIP nella radice del repository.
2. Sul branch `feature/v3-training-load`, esegui:

```powershell
python tools/apply_v311_chart_usability.py
cd dashboard
npm run build
npm run dev
```

## Modifiche

- Asse X con settimane (etichette ruotate) e asse Y con scala numerica.
- Unità e descrizione esplicite in ogni grafico.
- Tooltip Recharts migliorato (da verificare nel browser).
- Selettore **Dettaglio settimana** sotto ogni grafico: funziona anche se il tooltip al passaggio del mouse non compare.
- Legenda completa e settimana parziale distinta.

## Verifiche

- Seleziona due settimane diverse nel menu **Dettaglio settimana** e verifica che i valori cambino.
- Passa il mouse su barre e punti per verificare il tooltip.
- Controlla la resa a larghezza ridotta.
- Non eseguire merge su `main` prima dei controlli.
