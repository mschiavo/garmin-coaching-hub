# V4.1 — Decisioni aperte e default di attuazione locali

Le direttive di sviluppo locale sono state fissate dall'utente nel prompt `CODEX_V4_1_UNICO_PROSEGUIMENTO.md` e registrate in `V4_1_IMPLEMENTATION_DECISIONS.md`. Le scelte non autorizzano cloud o rilascio. La tabella seguente conserva il registro storico delle alternative e degli aspetti residuali.

Le otto decisioni seguenti richiedono approvazione prima di schema/RPC. Raccomandazioni non equivalgono ad approvazione.

| # | Decisione/opzioni | Raccomandazione | Impatto/approvatore |
|---|---|---|---|
| 1 | Ownership installazione o account? | Installazione-wide MVP; tutti gli allowlisted condividono il piano, senza chiamare Auth ID “atleta”. | Ogni allowlisted può leggere/scrivere. Owner prodotto e security devono approvare. |
| 2 | Timezone config installazione, ciclo o preferenza? | IANA sul ciclo, default config al momento di creazione e congelata. | Evita reinterpretazione storica; decidere chi può cambiare/override. Product. |
| 3 | Confine settimana? | Lunedì-domenica ISO, coerente con `monday()` in `analytics/dates.ts`; date range inclusive. | Confermare eccezioni e ciclo a metà settimana. Product. |
| 4 | Sessione solo data o ora? | Data nel MVP; ora solo se necessaria, con zona e regole DST per orari ambigui/inesistenti. | Evita conversioni senza contesto; gara può essere solo data. Product. |
| 5 | Cardinalità activity-session? | Activity al massimo una sessione; sessione può avere più activity solo caso approvato; link manuale. | Spec permette più activity per sessione ma richiede decisione opposta per activity; cambia schema/dedup. Product/QA. |
| 6 | Modifiche dopo inizio periodo? | Revision optimistic, event history minimale, soft cancel, reschedule tracciato. | Definire retention e snapshot vs eventi. Product/privacy. |
| 7 | Goal catalog/semantica? | MVP distanza/durata/sessioni + gara gap tempo; costanza solo con denominatore; no recovery/readiness. | Approvare unit, direction, zero, milestone, formula. Product/QA. |
| 8 | Matching e sorgente mutata? | Nessun auto-link; conferma manuale; cambio/rimozione activity marca link da verificare, non modifica piano. | Riduce doppi conteggi; approvare comportamento invalidazione. Product/data owner. |

## Gate

Registrare decisioni 1–8 nel decision log. In particolare ownership e cardinalità cambiano autorizzazione e conteggi. Finché aperte non implementare persistenza Planning/Goals; preview demo resta offline.
