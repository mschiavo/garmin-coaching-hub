# V3.1 — Training Load Refinement

Prerequisito: branch `feature/v3-training-load` con la precedente integrazione V3 già applicata.

1. Copiare `tools/apply_v31_refinement.py` nella cartella `tools` del repository.
2. Dalla radice: `python tools/apply_v31_refinement.py`.
3. Da `dashboard`: `npm run build` e `npm run dev`.
4. Verificare grafici, tooltip, settimane parziali e pannello metodologia.
5. Esaminare `git diff` prima del commit. Non fare merge su `main` finché la verifica non è conclusa.

## Cambiamenti
- Assi X con date delle settimane e tooltip di dettaglio.
- Linee `linear` per evitare interpolazioni curve tra misure settimanali.
- Settimana corrente evidenziata nei grafici a barre e indicata nei tooltip.
- Pannello metodologico e riepilogo testuale dei KPI.
- Nessuna modifica a SQL, credenziali o workflow Garmin.

## Limitazioni note
- La prima settimana di un filtro può includere attività precedenti al giorno iniziale perché i volumi sono aggregati per settimana di calendario.
- La settimana corrente è individuata rispetto alla data massima disponibile nel payload, non all'orologio del browser; se il sync è vecchio, l'indicazione può essere fuorviante.
- La RPC attuale restituisce al massimo 2.000 attività.
- Le medie delle settimane senza corse non rappresentano una media delle sole settimane attive.
- Il rapporto di volume non è una misura di rischio o fatica fisiologica.
