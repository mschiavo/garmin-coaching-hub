# Garmin Coaching Hub — V3.3 Advanced Analytics

Dashboard personale per attività Garmin, recupero e Training Load, con sincronizzazione Python, database Supabase e frontend React/TypeScript.

La Community Edition è destinata a un fork con un account Garmin e un progetto Supabase indipendenti. Non è una piattaforma multi-utente condivisa.

- [Installazione da zero](docs/COMMUNITY_SETUP.md)
- [Checklist e report di collaudo](docs/BETA_TEST.md)
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

## Stato della V3.3

La V3.3 usa Recharts 3.11 e la RPC esistente. Advanced Analytics include efficienza, prestazioni, recupero, carico e report settimanale scaricabile. Il collaudo con dati Garmin reali resta da eseguire.

La produzione upstream (`main`) resta separata. Leggere le avvertenze di sicurezza nella guida prima di distribuire il progetto.
