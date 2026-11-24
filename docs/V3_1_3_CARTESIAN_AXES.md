# V3.1.3 — Assi cartesiani con valori espliciti

Base: branch `feature/v3-training-load`, commit tree `8df7ddfe1ebf241e832191c13a4347519a60c3d1`.

## Installazione (Windows)
1. Estrarre ZIP nella radice del repository mantenendo `tools/` e `docs/`.
2. `python tools/apply_v313_cartesian_axes.py`
3. `cd dashboard`
4. `npm run build`
5. `npm run dev`
6. Forzare refresh nel browser (`Ctrl+F5`).

## Modifiche
- `Plot` (Panoramica, Allenamenti, Recupero, Prestazioni, Insights): tacche X esplicite, fino a 7 distribuite sull'intervallo, valori Y calcolati dalle serie visibili, griglia e testo ad alto contrasto.
- `LoadChart` (Training Load): date esplicite sull'asse X, valori Y con intervalli regolari e scala specifica per km, ore, numero di corse e rapporto.
- Scatter plot: entrambi gli assi numerici con tacche esplicite.
- Nessuna modifica a Supabase, Garmin, credenziali o GitHub Actions.

## Verifiche manuali
- Training Load: ogni grafico mostra date sotto e numeri a sinistra.
- Panoramica, Allenamenti, Recupero, Prestazioni, Insights: verificare grafici con dati reali.
- Resize finestra desktop/mobile e tooltip al passaggio del mouse.
- I valori sull'asse del ritmo in Prestazioni sono espressi in secondi/km come nei dati attuali: la conversione mm:ss/km resta un miglioramento successivo.

## Limitazioni note
- Settimane parziali e aggregazioni non sono state ricalcolate in questa patch, per mantenere il cambiamento focalizzato sulla visualizzazione.
- I grafici con molte date mostrano un sottoinsieme regolare delle etichette, non tutte, per evitare sovrapposizioni.
- La build TypeScript va eseguita sul PC locale: non è stata eseguita nel generatore del pacchetto.
