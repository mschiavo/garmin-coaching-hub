# V3.2 — Recharts migration (development)

Based on Community V3.1.5 (`3a363ab`). The beta tag and production remain untouched.

- Recharts 3.11.0 and matching react-is; lockfile committed.
- Chart components extracted into `src/charts.tsx`; shared axis props, direct chart children, responsive tick selection and complete dates in load tooltips; hover on desktop, tap on touch-only devices; replaces deprecated Cell with Bar shape.
- Ratio scale includes the 1× reference. Training Load calculations are unchanged.
- Node 22, `npm ci`, `npm run test:load`, `npm run build`, `npx playwright install chromium`, `npm run test:charts`.
- Browser tests use synthetic data only, in desktop and mobile viewports, and a no-credentials production-bundle smoke test; real Garmin and Supabase accounts are not required. The fixture is not a production entry point.
- The state and chart dependencies are separated in Vite. The 500 kB limit is checked by the one-shot preparation script. Do not increase the warning threshold to hide regressions.
- Still required: real-account dashboard check, visual review of all sections, independent tester feedback and CI on the new branch. This is not a production release.

Migration reference: https://github.com/recharts/recharts/wiki/3.0-migration-guide
