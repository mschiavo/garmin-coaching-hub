# Garmin Coaching Hub — V3.4.1 Staging & Reliability

Dashboard personale per attività Garmin, recupero e Training Load, con sincronizzazione Python, database Supabase e frontend React/TypeScript.

La Community Edition è destinata a un fork con un account Garmin e un progetto Supabase indipendenti. Non è una piattaforma multi-utente condivisa.

- [Installazione da zero](docs/COMMUNITY_SETUP.md)
- [Checklist e report di collaudo](docs/BETA_TEST.md)
- [Data Intelligence V3.4](docs/V3_4_DATA_INTELLIGENCE.md)
- [Migrazione e collaudo V3.4](docs/V3_4_MIGRATION_GUIDE.md)
- [Report di implementazione V3.4](docs/V3_4_IMPLEMENTATION_REPORT.md)
- [Contratto di copertura V3.4.1](docs/V3_4_1_STAGING_RELIABILITY.md)
- [Runbook di staging V3.4.1](docs/V3_4_1_STAGING_RUNBOOK.md)
- [Report di implementazione V3.4.1](docs/V3_4_1_IMPLEMENTATION_REPORT.md)
- [Advanced Analytics V3.3](docs/V3_3_ANALYTICS.md)
- [Training Load](docs/V3_TRAINING_LOAD.md)
- [Grafici interattivi V3.1.4](README-V3.1.4.md)

## Ambiente di sviluppo

Node.js 22 LTS (minimo 22), npm, Python 3.12, Git.

```sh
cd dashboard
npm ci
npm run build
npm run dev
```

Per il frontend locale, copiare `.env.example` in `.env.local` nella cartella dashboard e impostare solo URL pubblico e chiave publishable/anon del proprio progetto. Mai inserire chiavi Garmin, password PostgreSQL o service_role nel frontend.

Dalla radice: `python -m unittest discover -s tests -v`.

## Stato della V3.4

La V3.4 usa Recharts 3.11 e quattro RPC paginate con controllo di revisione. Qualità dei dati mostra copertura, misure valide, anomalie e piano di recupero. La dashboard può leggere lo schema V3.3 in modalità legacy. Il collaudo su Supabase separato e con dati Garmin autorizzati resta da eseguire.

V3.4.1 aggiunge riconciliazione per ID, invalidazione della copertura dopo scritture legacy e un riepilogo operativo condiviso. La migrazione SQL 0035 estende lo schema 34 e mantiene le RPC compatibili. Il percorso verso Supabase e Garmin resta soggetto ai gate nel runbook.

La produzione upstream (`main`) resta separata. Leggere le avvertenze di sicurezza nella guida prima di distribuire il progetto.
