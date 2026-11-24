# Piano di collaudo — Community V3.1.5 Beta

Eseguire esclusivamente con un proprio account Garmin e un nuovo Supabase. Registrare PASS, FAIL o NON TESTATO per ogni voce. Non usare credenziali o dati del maintainer.

## Ambiente e installazione

- [ ] Fork: branch predefinito `feature/community-v3-beta`, SHA annotato.
- [ ] Node.js 22, `npm ci` senza EBADENGINE; deprecazione Recharts 2 nota.
- [ ] `npm run build` senza warning chunk; `Community Edition Checks` verde per Python e frontend.
- [ ] Bootstrap e SQL dashboard su un progetto vuoto.
- [ ] Login corretto con utente autorizzato; utente non in allowlist non riceve dati; logout funzionante.

## Dati Garmin

- [ ] Test Garmin Authentication riuscito; nessun token nei log.
- [ ] Sync 3 giorni, date e conteggi coerenti con Garmin.
- [ ] Ripetizione dello stesso sync senza duplicati (confrontare conteggi per lo stesso intervallo).
- [ ] Import di un mese passato con dati, preferibilmente antecedente al 2026 se disponibili.
- [ ] Verifica fuso orario, giornate mancanti e riepilogo delle metriche incomplete.
- [ ] Verifica che una configurazione errata non dia accesso ai dati di altri account; non usare credenziali altrui.

## Dashboard

- [ ] Avvio locale, deploy Pages nel fork, ricaricamento pagina.
- [ ] Panoramica, Allenamenti, Recupero, Prestazioni, Insights, Training Load: dati e navigazione.
- [ ] Assi X/Y con tacche leggibili, griglia, tooltip con valori e unità, legenda.
- [ ] Volume settimanale e media delle quattro settimane precedenti confrontati con dati sorgente; settimane incomplete identificate; valori assenti non presentati come misurati.
- [ ] Rapporto di carico e linea 1×; nessun rapporto artificiale quando manca il riferimento.
- [ ] Selettore Dettaglio settimana, layout desktop/mobile e tocco; nessun errore console.
- [ ] Stato senza dati, periodi brevi, cambio filtro e nuovo accesso dopo logout.

## Report per il maintainer (senza segreti)

```text
Branch e SHA:
Node/npm/Python:
Browser e dispositivo:
Build e CI:
Bootstrap/login/allowlist:
Sync e ripetizione:
Storico (mese):
Dashboard e grafici:
Deploy Pages:
Esito checklist (PASS/FAIL/NON TESTATO):
Problema: schermata o job, passaggi per riprodurlo,
risultato atteso, risultato effettivo, errore sanitizzato.
```

Non allegare URL PostgreSQL, chiavi, email, token, metriche personali o schermate non anonimizzate. Non considerare superata una prova non eseguita. La promozione a stabile richiede collaudo indipendente e verifica della sicurezza della cronologia.
