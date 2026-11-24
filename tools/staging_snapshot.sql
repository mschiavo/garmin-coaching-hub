SELECT to_regclass('coaching.import_coverage') IS NOT NULL AS has_coverage,
       to_regprocedure('public.dashboard_metadata_v2(text,text)') IS NOT NULL AS has_v2,
       EXISTS (SELECT FROM dashboard_private.allowed_users
               WHERE user_id='00000000-0000-0000-0000-000000000001') AS has_stub_access
\gset
SELECT count(*), min(activity_date), max(activity_date) FROM coaching.garmin_activities;
SELECT count(*), min(metric_date), max(metric_date) FROM coaching.garmin_daily_metrics;
SELECT count(*) FROM dashboard_private.allowed_users;
\if :has_coverage
SELECT count(*), min(day), max(day) FROM coaching.import_coverage;
\endif
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('dashboard_data','dashboard_metadata_v2',
         'dashboard_activities_v2','dashboard_daily_v2','dashboard_coverage_v2'))
   OR (n.nspname IN ('coaching','dashboard_private') AND p.prokind='f')
ORDER BY 1,2,3;
\if :{?local_stub}
\if :has_stub_access
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT md5(public.dashboard_data()::text);
\if :has_v2
SELECT md5(public.dashboard_metadata_v2()::text);
\endif
ROLLBACK;
\endif
\endif
