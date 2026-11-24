# Garmin Coaching Hub V3.3 — Advanced Analytics

Nel menu **Advanced Analytics**, il selettore **Modulo** apre Efficienza, Prestazioni, Recupero, Carico avanzato o Report settimanale. Il filtro **Intervallo** limita le viste e le attività selezionabili. I riferimenti storici possono usare giorni antecedenti al filtro. Il report si ricalcola all’apertura o al cambio di settimana e si può scaricare come Markdown UTF-8.

## Dati e calendario

La RPC esistente `dashboard_data()` restituisce fino a 2.000 attività e 2.000 giornate. L’orizzonte osservato va dalla prima all’ultima data valida ricevuta, escludendo date future rispetto al giorno civile del browser. La completezza dell’import non è verificabile. Un conteggio pari a zero indica zero attività registrate. Distanze e durate mancanti sono escluse dalle somme e i denominatori mostrano quante attività contribuiscono. La durata proviene da `summary.duration` in secondi. Il contratto dati non specifica il tempo in movimento.

Si usano date `YYYY-MM-DD` e aritmetica di calendario UTC. La settimana va da lunedì a domenica. Una domenica osservata già trascorsa chiude la settimana. Il giorno civile corrente resta parziale, come le settimane tagliate dal filtro o dall’orizzonte. Le coorti separano `running` da `trail_running`. Gli altri sport non contribuiscono. Il carico totale e il report sommano le corse dei due tipi per descrivere il volume registrato.

## Efficienza e prestazioni

Il ritmo in s/km è durata in secondi × 1.000 ÷ distanza in metri. La velocità in km/h è 3.600 ÷ ritmo. L’indice di efficienza divide la velocità per la FC media in bpm. Per esempio, 10 km in 3.600 s a 150 bpm corrispondono a 360 s/km e 0,0667 km/h per bpm.

Le fasce di distanza sono [3,5), [5,10), [10,15), [15,22) e da 22 km. Sotto 3 km le attività rimangono nell’archivio. La fascia FC parte da `floor(FC / 10) × 10` bpm. Il confronto usa la stessa coorte nelle ultime quattro settimane complete e nelle quattro precedenti, con almeno tre attività per finestra. La variazione è 100 × (mediana recente ÷ mediana precedente − 1). Le mediane settimanali di ritmo, FC media e indice mantengono le lacune. Meteo, terreno, dislivello e pause possono influire sui valori. Le medie per uscita non permettono di calcolare il disaccoppiamento cardiaco.

Le migliori attività mostrano distanza, durata o ritmo dell’intera uscita con data e tipo. Il contratto dati non offre lap per ricostruire segmenti. Riegel proietta 5, 10 e 21,0975 km da un’attività scelta e confermata. Il modello usa T₂ = T₁ × (D₂/D₁)^1,06 entro un rapporto massimo di 2,5 in entrambe le direzioni. Un riferimento di 10 km in 3.600 s dà circa 1.727 s sui 5 km. Le stime sono indicative e risentono dell’idoneità della prestazione scelta.

## Recupero

Ogni metrica mostra l’ultima rilevazione valida nell’intervallo e la mediana dei 28 giorni precedenti, escludendo il giorno della misura. Servono 14 date valide distinte. Con una mediana positiva, la differenza percentuale è 100 × (valore − mediana) ÷ mediana. Le deviazioni del sonno sono riportate anche in minuti. Le unità sono ore (sonno, convertito da secondi dalla RPC), ms (HRV notturna Garmin), bpm (FC a riposo) e punti Garmin (stress, Body Battery caricata e scaricata).

Il trend è la mediana mobile sui sette giorni terminanti alla data di ciascun punto e richiede almeno quattro misure. La copertura appare nel tooltip e l’ultima misura è datata. Per duplicati giornalieri vale l’ultimo valore valido nell’ordine del payload, separatamente per metrica. Stress e Body Battery accettano zero. Sonno, HRV e FC a riposo richiedono valori positivi. Le deviazioni sono descrittive e non producono punteggi o prescrizioni.

## Carico e report

Il carico avanzato mostra distanza, ore registrate, corse e giorni attivi per periodo selezionato, ultimi 7 e ultimi 28 giorni inclusivi. Il rapporto usa il volume degli ultimi sette giorni diviso per la somma dei 28 immediatamente precedenti, divisa a sua volta per quattro. Con riferimento zero o orizzonte insufficiente il rapporto è indisponibile. Le distribuzioni contano le attività per fascia di distanza o ritmo della singola uscita. La FC media non consente di ricavare minuti per zona. Le viste V3.2 mantengono l’aggregazione storica per settimane di calendario. La V3.3 riconosce le date impossibili, elimina il limite di 550 settimane e tratta una domenica osservata già trascorsa come conclusa.

Il report propone l’ultima settimana conclusa nell’intervallo osservato, quando presente. Le settimane ai margini sono marcate come parziali. Il report mostra registrazioni, confronto con settimana precedente e media delle quattro precedenti quando l’orizzonte è sufficiente, indice della coorte, recupero e copertura. È generato nel browser dai dati caricati, senza chiamate aggiuntive o pianificazione.

## Verifiche locali

Con Node 22 aggiornato e Chromium Playwright:

```sh
cd dashboard
npm ci --no-audit --no-fund
npm run test:load
npm run test:analytics
npm run build
npx playwright install chromium
npm run test:charts
cd ..
python -m unittest discover -s tests -v
python -m py_compile sync_garmin.py import_garmin_history.py
git diff --check
```

Su Windows usare `npm.cmd` e `npx.cmd` se necessario. Python richiede i dati dei fusi IANA, disponibili con `tzdata` su Windows. Playwright avvia il dev server con parametri sintetici e intercetta Auth e RPC del dominio riservato `.invalid`. Verifica anche il bundle di produzione servito da Vite Preview.
