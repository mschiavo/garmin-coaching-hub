-- Garmin Coaching Hub Dashboard V1
-- Eseguire nel SQL Editor di Supabase con un ruolo amministrativo.
-- NON usare la service_role key nel frontend.
-- Il frontend invoca solo public.dashboard_data(), che verifica una allowlist.

CREATE SCHEMA IF NOT EXISTS dashboard_private;
REVOKE ALL ON SCHEMA dashboard_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS dashboard_private.allowed_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON dashboard_private.allowed_users FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM dashboard_private.allowed_users u WHERE u.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Accesso non autorizzato' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'activities', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.date, a.id)
      FROM (
        SELECT
          activity_id AS id,
          activity_date::text AS date,
          activity_type AS type,
          raw_data -> 'summary' ->> 'activityName' AS name,
          CASE WHEN raw_data -> 'summary' ->> 'distance' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (raw_data -> 'summary' ->> 'distance')::numeric ELSE NULL END AS distance_m,
          CASE WHEN raw_data -> 'summary' ->> 'duration' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (raw_data -> 'summary' ->> 'duration')::numeric ELSE NULL END AS duration_s,
          CASE WHEN raw_data -> 'summary' ->> 'averageHR' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (raw_data -> 'summary' ->> 'averageHR')::numeric ELSE NULL END AS average_hr
        FROM coaching.garmin_activities
        ORDER BY activity_date DESC, activity_id DESC
        LIMIT 2000
      ) a
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date)
      FROM (
        SELECT
          metric_date::text AS date,
          CASE WHEN sleep_data ->> 'sleepTimeSeconds' ~ '^[0-9]+([.][0-9]+)?$'
            THEN ROUND((sleep_data ->> 'sleepTimeSeconds')::numeric / 3600, 3) ELSE NULL END AS sleep_h,
          CASE WHEN hrv_data -> 'hrvSummary' ->> 'lastNightAvg' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (hrv_data -> 'hrvSummary' ->> 'lastNightAvg')::numeric ELSE NULL END AS hrv,
          CASE WHEN daily_summary -> 'data' -> 0 -> 'heartRate' ->> 'restingValue' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (daily_summary -> 'data' -> 0 -> 'heartRate' ->> 'restingValue')::numeric ELSE NULL END AS resting_hr,
          CASE WHEN stress_data -> 0 -> 'values' ->> 'overallStressLevel' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (stress_data -> 0 -> 'values' ->> 'overallStressLevel')::numeric ELSE NULL END AS stress,
          CASE WHEN body_battery_data -> 0 ->> 'charged' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (body_battery_data -> 0 ->> 'charged')::numeric ELSE NULL END AS bb_charged,
          CASE WHEN body_battery_data -> 0 ->> 'drained' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (body_battery_data -> 0 ->> 'drained')::numeric ELSE NULL END AS bb_drained,
          CASE WHEN daily_summary -> 'data' -> 0 -> 'movement' -> 'steps' ->> 'value' ~ '^[0-9]+([.][0-9]+)?$'
            THEN (daily_summary -> 'data' -> 0 -> 'movement' -> 'steps' ->> 'value')::numeric ELSE NULL END AS steps
        FROM coaching.garmin_daily_metrics
        ORDER BY metric_date DESC
        LIMIT 2000
      ) d
    ), '[]'::jsonb),
    'updated_at', (
      SELECT MAX(t) FROM (
        SELECT MAX(synced_at) AS t FROM coaching.garmin_activities
        UNION ALL
        SELECT MAX(synced_at) AS t FROM coaching.garmin_daily_metrics
      ) x
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- Il proprietario della funzione deve poter leggere le tabelle coaching.
-- Se il SQL Editor usa postgres, normalmente è già così.
REVOKE ALL ON FUNCTION public.dashboard_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_data() TO authenticated;

-- DOPO aver creato un account in Authentication > Users,
-- sostituire l'UUID e scommentare:
-- INSERT INTO dashboard_private.allowed_users(user_id)
-- VALUES ('00000000-0000-0000-0000-000000000000')
-- ON CONFLICT (user_id) DO NOTHING;
