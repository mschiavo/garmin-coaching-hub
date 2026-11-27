# V4.1 — Matematica dei goal, periodi e copertura

**Stato:** contratto proposto, non approvato; esempi sintetici. Formula proposta `goal-progress-1`.

## Calcolo quantitativo

Solo con target/actual validi, unità canoniche omogenee, stessa finestra e fonte idonea. Per quantità non negative e target `>0` con direzione `at_least`:

```text
progress_pct = 100 × actual / target
gap_abs = actual − target
gap_pct = 100 × (actual − target) / target
```

40 km target/28 km actual ⇒ 70%, gap −12 km/−30%. 45 km ⇒ 112,5%, +5 km. Arco può saturare a 100 ma valore e gap rimangono. Superare volume non prova beneficio o sovraccarico. Target zero/null ⇒ percentuale non definita; actual null non è zero. Actual zero è legittimo soltanto con copertura che dimostri zero. Convertire unità prima di aggregare.

`at_most` e `exact` hanno semantica distinta, non riusare una label generica “progresso”. Tempo gara è lower-is-better: target 3:45:00, risultato 3:50:00 ⇒ gap +300 s (più lento); 3:40:00 ⇒ −300 s. Niente percentuale intrinseca; una proiezione è stima separata, versionata.

## Aderenza e periodo aperto

Aderenza = sessioni scadute valutabili / sessioni scadute eleggibili, con conteggi distinti per completamenti verificati e manuali. Escludere future, cancelled e superseded. Manual completion non incrementa attività verificate, chilometri o secondi Garmin. Attività fuori piano aumenta volume ma non aderenza. Deduplicare totale per activity ID; una activity può avere un solo link attivo. Una sessione può collegare più attività, sommate una sola volta per ID.

Esempio settimana target 30 km. A mercoledì actual 18 km, planned-to-date (sessioni datate entro mercoledì) 25 km, gap −7. Sedute future non sono ritardo. 18/25=72% descrive il piano già dovuto, non il completamento del goal settimanale. Senza distribuzione giornaliera mostrare actual/target e “periodo in corso”; niente ripartizione uniforme inventata.

## Copertura

Coverage è per giorno/sorgente. 0034 consente `success_empty` solo activities; un valore zero aggregate è attestato solo se ogni data del periodo ha `source=activities`, `attempt_state=evidence=success_empty`, `item_count=0` e `reconciliation=verified`. L'assenza di riga, `reconciliation NULL` o assenza di misura giornaliera non è zero. Stati proposti:

- `available`: intervallo coperto e campioni validi secondo metrica;
- `partial`: almeno un campione ma copertura incompleta/parziale;
- `unknown`: nessun campione utile/evidenza sufficiente;
- `invalid`: unità/schema/valore fuori contratto.

Failed/unsupported/conflict/invalidated sono motivi di copertura non affidabile, non giorni vuoti. Oggi può essere parziale. Mostrare campioni validi, giorni attesi/coperti, sorgenti, timestamp e campioni esclusi; non interpolare/estrapolare. `success_empty` è prova di assenza per attività solo nel perimetro attestato.

## Dedup e casi limite

- ID `activity_id` bigint, non nome/data; writer può aggiornare payload/data e la revision invalida risultati.
- Distanza/durata null/anomala escluse da quella metrica con motivo.
- Link ambigui/multipli rendono risultato partial; no matching per sola data.
- Range civili inclusive `[start,end]`; SQL può usare `[start,end+1)` con controllo limiti.
- HRV/sonno mancanti non sono readiness zero; recovery non è percentuale goal generica.

| Caso | Risultato corretto |
|---|---|
| target 0/null | percent null o input rifiutato |
| actual null, coverage ignota | unknown, non zero |
| actual zero con coverage valida | 0% ammesso |
| >100% | percent e gap reali; solo arco clamp |
| metri/km misti | convertire o rifiutare |
| periodo aperto con piano | actual-to-date vs planned-to-date |
| senza distribuzione | no prorata |
| 5/7 giorni covered | partial con conteggio |
| race time | delta secondi orientato, no percentage |
| cancelled/skipped | cancelled esclusa; skipped secondo regola approvata |

Volume, aderenza, performance e recovery sono dimensioni distinte. Goal raggiunto non dichiara sicurezza medica.

## Test futuri richiesti

Property tests monotonicità solo nel dominio; unità, zero/null, oltre-target, date inclusive, direzione race, planned-to-date, DST, coverage, giornata corrente, revision/invalidation, dedup, link ambiguo e risposte parziali. SQL tests per snapshot/concorrenza/ACL. UI tests per campioni e stati non solo color-coded.
