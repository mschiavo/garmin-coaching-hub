# Garmin Coaching Hub — Community Edition V2.1 beta test

> Beta: not yet verified with a second Garmin account or a new Supabase instance.

## For the maintainer
1. Copy this package into the root of the `feature/community-edition-foundation` branch (merge folders, do not delete existing files).
2. Run `python tools/apply_community_v21.py` **once** to update the two existing Python scripts. The script verifies all expected source patterns before writing either file. It is idempotent.
3. Run `python -m unittest discover -s tests -v` and `python -m py_compile sync_garmin.py import_garmin_history.py`.
4. Inspect `git diff`, commit, push and wait for **Community Edition Checks** to pass.
5. Keep `main` unchanged until the beta test succeeds.

## For the beta tester
1. Create a fork of the beta branch (GitHub's fork UI may default to `main`; select/copy the beta branch explicitly).
2. Create a **new** Supabase project; run `supabase/bootstrap.sql` followed by `supabase/dashboard.sql` in its SQL Editor.
3. Create an email/password user in Supabase Auth, confirm the email if required, then add that user's UUID to `dashboard_private.allowed_users` as documented in `docs/COMMUNITY_SETUP.md`.
4. In the fork's GitHub Actions **Secrets**, set `GARMIN_PERSONAL_API_KEY` and `SUPABASE_DATABASE_URL`. In Actions **Variables**, set `VITE_SUPABASE_URL` (project base URL only), `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `GARMIN_TIMEZONE` (e.g. `Europe/Rome`). Never post these values in issues or chat.
5. In repository Settings > Pages, choose GitHub Actions. Enable workflows if GitHub asks.
6. Run **Garmin Supabase Sync** with 3 days; check the run completes and that Supabase tables contain rows.
7. Run **Garmin History Import** with a month such as `2025-09` (use a month in which you actually have Garmin data). It may take time and Garmin can rate-limit requests.
8. Run **Deploy Garmin Dashboard to GitHub Pages**, log in, and check charts and activity list.

## Report results (no secrets)
- Fork branch and commit SHA:
- New Supabase bootstrap: PASS/FAIL
- Sync 3 days: PASS/FAIL
- Import YYYY-MM: PASS/FAIL
- Login/dashboard: PASS/FAIL
- Any errors: paste sanitized job name, error type, and step; redact tokens, connection URLs, emails, activity details.

## Security caveat
The source repository was already public. **This package does not certify the Git history or previously committed ZIP files as secret-free.** Before asking another person to fork it, audit all commits and binary artifacts for secrets; revoke/rotate any leaked credentials. GitHub secret scanning is useful but not a substitute for reviewing history.

## Limitations
- This beta uses one Supabase project per runner, not a shared multi-tenant service.
- The initial bootstrap is for a fresh project, not a migration for existing databases.
- The historical importer still fetches in 7-day blocks and its workflow has a 45-minute limit. Import months individually.
