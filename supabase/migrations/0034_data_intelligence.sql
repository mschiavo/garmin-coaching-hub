BEGIN;
DO $$
BEGIN
  IF to_regclass('coaching.garmin_activities') IS NULL
     OR to_regclass('coaching.garmin_daily_metrics') IS NULL
     OR to_regclass('dashboard_private.allowed_users') IS NULL
     OR to_regprocedure('public.dashboard_data()') IS NULL THEN
    RAISE EXCEPTION 'Installare prima bootstrap.sql e dashboard.sql';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS coaching.intelligence_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  schema_version integer NOT NULL CHECK (schema_version = 34),
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO coaching.intelligence_state (schema_version) VALUES (34) ON CONFLICT DO NOTHING;
DO $version$
BEGIN
  IF NOT EXISTS (SELECT FROM coaching.intelligence_state WHERE singleton AND schema_version=34) THEN
    RAISE EXCEPTION 'Versione schema incompatibile con V3.4';
  END IF;
END $version$;

CREATE TABLE IF NOT EXISTS coaching.import_coverage (
  day date NOT NULL CHECK (day BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  source text NOT NULL CHECK (source IN ('activities','sleep','hrv','body_battery','stress','daily_summary')),
  attempt_state text NOT NULL CHECK (attempt_state IN ('success_with_data','success_empty','failed','unsupported','partial')),
  attempted_at timestamptz NOT NULL,
  evidence text CHECK (evidence IN ('success_with_data','success_empty')),
  succeeded_at timestamptz,
  item_count integer CHECK (item_count >= 0),
  quality text CHECK (quality IN ('validated','source_empty')),
  error_code text CHECK (error_code ~ '^[a-z0-9_]{1,32}$'),
  PRIMARY KEY (day, source),
  CHECK ((evidence IS NULL) = (succeeded_at IS NULL)),
  CHECK ((evidence IS NULL) = (item_count IS NULL)),
  CHECK ((evidence IS NULL) = (quality IS NULL)),
  CHECK (evidence <> 'success_empty' OR (source = 'activities' AND item_count = 0 AND quality = 'source_empty')),
  CHECK (evidence <> 'success_with_data' OR (item_count > 0 AND quality = 'validated'))
);
REVOKE ALL ON SCHEMA coaching FROM PUBLIC, anon, authenticated;
REVOKE ALL ON coaching.garmin_activities, coaching.garmin_daily_metrics,
  coaching.intelligence_state, coaching.import_coverage FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS garmin_activities_keyset_v2 ON coaching.garmin_activities (activity_date, activity_id) WHERE activity_id > 0;

CREATE OR REPLACE FUNCTION coaching.bump_intelligence_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE coaching.intelligence_state SET revision = revision + 1 WHERE singleton;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION coaching.bump_intelligence_revision() FROM PUBLIC, anon, authenticated;
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['garmin_activities','garmin_daily_metrics','import_coverage'] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER intelligence_revision AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON coaching.%I FOR EACH STATEMENT EXECUTE FUNCTION coaching.bump_intelligence_revision()', target);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION dashboard_private.iso_date_v2(value text)
RETURNS date LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = '' AS $$
BEGIN
  IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Data ISO non valida' USING ERRCODE = '22023';
  END IF;
  RETURN value::date;
END $$;
REVOKE ALL ON FUNCTION dashboard_private.iso_date_v2(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION dashboard_private.check_v2(p_start text, p_end text, p_limit integer)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT FROM dashboard_private.allowed_users WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Accesso non autorizzato' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR dashboard_private.iso_date_v2(p_start) > dashboard_private.iso_date_v2(p_end)
    OR dashboard_private.iso_date_v2(p_start) < DATE '0001-01-01' OR dashboard_private.iso_date_v2(p_end) > DATE '9999-12-31'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Parametri non validi' USING ERRCODE = '22023';
  END IF;
  RETURN (SELECT revision::text FROM coaching.intelligence_state WHERE singleton);
END $$;

CREATE OR REPLACE FUNCTION dashboard_private.metric_v2(value text, low numeric, high numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN length(value) <= 24 AND value ~ '^-?[0-9]+([.][0-9]+)?$' THEN
    CASE WHEN value::numeric BETWEEN low AND high THEN value::numeric END
  END
$$;
REVOKE ALL ON FUNCTION dashboard_private.check_v2(text,text,integer), dashboard_private.metric_v2(text,numeric,numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_metadata_v2(p_start text DEFAULT '0001-01-01', p_end text DEFAULT '9999-12-31')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_revision text := dashboard_private.check_v2(p_start,p_end,250);
  v_start date := dashboard_private.iso_date_v2(p_start);
  v_end date := dashboard_private.iso_date_v2(p_end);
BEGIN
  RETURN jsonb_build_object('api_version',2,'schema_version',34,'revision',v_revision,
    'coverage_status', CASE WHEN EXISTS (SELECT FROM coaching.import_coverage WHERE day BETWEEN v_start AND v_end)
      THEN 'available' ELSE 'unknown' END,
    'activities', (SELECT jsonb_build_object('min',min(activity_date),'max',max(activity_date),
      'count',count(*) FILTER (WHERE activity_date BETWEEN v_start AND v_end))
      FROM coaching.garmin_activities WHERE activity_id > 0 AND activity_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    'daily', (SELECT jsonb_build_object('min',min(metric_date),'max',max(metric_date),
      'count',count(*) FILTER (WHERE metric_date BETWEEN v_start AND v_end))
      FROM coaching.garmin_daily_metrics WHERE metric_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
    'coverage', (SELECT jsonb_build_object('min',min(day),'max',max(day),
      'count',count(*) FILTER (WHERE day BETWEEN v_start AND v_end)) FROM coaching.import_coverage),
    'anomalies', jsonb_build_object(
      'activities', (SELECT count(*) FROM coaching.garmin_activities
        WHERE activity_id <= 0 OR activity_date IS NULL OR activity_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
      'daily', (SELECT count(*) FROM coaching.garmin_daily_metrics WHERE metric_date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')),
    'updated_at', greatest((SELECT max(synced_at) FROM coaching.garmin_activities),
      (SELECT max(synced_at) FROM coaching.garmin_daily_metrics)));
END $$;
REVOKE ALL ON FUNCTION public.dashboard_metadata_v2(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_metadata_v2(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_activities_v2(
  p_start text, p_end text, p_revision text, p_limit integer DEFAULT 250,
  p_after_date text DEFAULT NULL, p_after_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_revision text := dashboard_private.check_v2(p_start,p_end,p_limit);
  v_start date := dashboard_private.iso_date_v2(p_start);
  v_end date := dashboard_private.iso_date_v2(p_end);
  v_after date := dashboard_private.iso_date_v2(p_after_date);
BEGIN
  IF p_revision IS NULL OR p_revision !~ '^[0-9]{1,19}$' OR
     (p_after_date IS NOT NULL AND v_after NOT BETWEEN v_start AND v_end) OR
     ((p_after_date IS NULL) <> (p_after_key IS NULL)) OR (p_after_key !~ '^[1-9][0-9]{0,18}$' OR
       CASE WHEN p_after_key ~ '^[1-9][0-9]{0,18}$' THEN p_after_key::numeric > 9223372036854775807 ELSE false END) THEN
    RAISE EXCEPTION 'Cursore o revisione non validi' USING ERRCODE = '22023';
  END IF;
  IF p_revision <> v_revision THEN
    RAISE EXCEPTION 'Revisione cambiata' USING ERRCODE = '40001';
  END IF;
  RETURN (
    WITH candidates AS MATERIALIZED (
      SELECT * FROM coaching.garmin_activities
      WHERE activity_date BETWEEN v_start AND v_end AND activity_id > 0
        AND (p_after_date IS NULL OR (activity_date, activity_id) > (v_after,p_after_key::bigint))
      ORDER BY activity_date, activity_id
      LIMIT p_limit + 1
    ), page AS (
      SELECT * FROM candidates ORDER BY activity_date, activity_id LIMIT p_limit
    ), enriched AS (
      SELECT jsonb_build_object('date',activity_date,'id',activity_id::text,'type',activity_type,'name',left(raw_data -> 'summary' ->> 'activityName',200),
        'distance_m',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'distance',0.001,10000000),
        'duration_s',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'duration',0.001,864000),
        'average_hr',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'averageHR',20,250),
        'elevation_gain_m',coalesce(dashboard_private.metric_v2(raw_data -> 'summary' ->> 'elevationGain',0,60000),
          dashboard_private.metric_v2(raw_data #>> '{detail,summaryDTO,elevationGain}',0,60000)),
        'elevation_loss_m',coalesce(dashboard_private.metric_v2(raw_data -> 'summary' ->> 'elevationLoss',0,60000),
          dashboard_private.metric_v2(raw_data #>> '{detail,summaryDTO,elevationLoss}',0,60000)),
        'cadence_spm',coalesce(dashboard_private.metric_v2(raw_data -> 'summary' ->> 'averageRunningCadenceInStepsPerMinute',1,300),
          dashboard_private.metric_v2(raw_data #>> '{detail,summaryDTO,averageRunCadence}',1,300)),
        'power_w',dashboard_private.metric_v2(raw_data #>> '{detail,summaryDTO,averagePower}',0,4000),
        'temperature_c',dashboard_private.metric_v2(raw_data #>> '{detail,summaryDTO,averageTemperature}',-90,70),
        'fastest_1000_s',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'fastestSplit_1000',60,86400),
        'hr_zone_1_s',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'hrTimeInZone_1',0,864000),
        'hr_zone_2_s',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'hrTimeInZone_2',0,864000),
        'hr_zone_3_s',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'hrTimeInZone_3',0,864000),
        'hr_zone_4_s',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'hrTimeInZone_4',0,864000),
        'hr_zone_5_s',dashboard_private.metric_v2(raw_data -> 'summary' ->> 'hrTimeInZone_5',0,864000)) AS item,
        jsonb_build_object('date',activity_date,'key',activity_id::text) AS cursor,
        row_number() OVER (ORDER BY activity_date, activity_id) AS position
      FROM page
    )
    SELECT jsonb_build_object('revision',v_revision,'limit',p_limit,
      'count',(SELECT count(*) FROM page),
      'has_more',(SELECT count(*) > p_limit FROM candidates),
      'next_cursor', CASE WHEN (SELECT count(*) > p_limit FROM candidates)
        THEN (SELECT cursor FROM enriched WHERE position = p_limit) END,
      'rows',coalesce((SELECT jsonb_agg(item ORDER BY position) FROM enriched),'[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.dashboard_activities_v2(text,text,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_activities_v2(text,text,text,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_daily_v2(
  p_start text, p_end text, p_revision text, p_limit integer DEFAULT 250,
  p_after_date text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_revision text := dashboard_private.check_v2(p_start,p_end,p_limit);
  v_start date := dashboard_private.iso_date_v2(p_start);
  v_end date := dashboard_private.iso_date_v2(p_end);
  v_after date := dashboard_private.iso_date_v2(p_after_date);
BEGIN
  IF p_revision IS NULL OR p_revision !~ '^[0-9]{1,19}$' OR
     (p_after_date IS NOT NULL AND v_after NOT BETWEEN v_start AND v_end) THEN
    RAISE EXCEPTION 'Cursore o revisione non validi' USING ERRCODE = '22023';
  END IF;
  IF p_revision <> v_revision THEN
    RAISE EXCEPTION 'Revisione cambiata' USING ERRCODE = '40001';
  END IF;
  RETURN (
    WITH candidates AS MATERIALIZED (
      SELECT * FROM coaching.garmin_daily_metrics
      WHERE metric_date BETWEEN v_start AND v_end
        AND (p_after_date IS NULL OR metric_date > v_after)
      ORDER BY metric_date
      LIMIT p_limit + 1
    ), page AS (
      SELECT * FROM candidates ORDER BY metric_date LIMIT p_limit
    ), enriched AS (
      SELECT jsonb_build_object('date',metric_date,'sleep_h',round(dashboard_private.metric_v2(sleep_data ->> 'sleepTimeSeconds',1,86400)/3600,3),
        'hrv',dashboard_private.metric_v2(hrv_data -> 'hrvSummary' ->> 'lastNightAvg',1,500),
        'resting_hr',dashboard_private.metric_v2(daily_summary -> 'data' -> 0 -> 'heartRate' ->> 'restingValue',20,250),
        'stress',dashboard_private.metric_v2(stress_data -> 0 -> 'values' ->> 'overallStressLevel',0,100),
        'bb_charged',dashboard_private.metric_v2(body_battery_data -> 0 ->> 'charged',0,1000),
        'bb_drained',dashboard_private.metric_v2(body_battery_data -> 0 ->> 'drained',0,1000),
        'steps',dashboard_private.metric_v2(daily_summary -> 'data' -> 0 -> 'movement' -> 'steps' ->> 'value',0,200000)) AS item,
        jsonb_build_object('date',metric_date) AS cursor,
        row_number() OVER (ORDER BY metric_date) AS position
      FROM page
    )
    SELECT jsonb_build_object('revision',v_revision,'limit',p_limit,
      'count',(SELECT count(*) FROM page),
      'has_more',(SELECT count(*) > p_limit FROM candidates),
      'next_cursor', CASE WHEN (SELECT count(*) > p_limit FROM candidates)
        THEN (SELECT cursor FROM enriched WHERE position = p_limit) END,
      'rows',coalesce((SELECT jsonb_agg(item ORDER BY position) FROM enriched),'[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.dashboard_daily_v2(text,text,text,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_daily_v2(text,text,text,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_coverage_v2(
  p_start text, p_end text, p_revision text, p_limit integer DEFAULT 250,
  p_after_date text DEFAULT NULL, p_after_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_revision text := dashboard_private.check_v2(p_start,p_end,p_limit);
  v_start date := dashboard_private.iso_date_v2(p_start);
  v_end date := dashboard_private.iso_date_v2(p_end);
  v_after date := dashboard_private.iso_date_v2(p_after_date);
BEGIN
  IF p_revision IS NULL OR p_revision !~ '^[0-9]{1,19}$' OR
     (p_after_date IS NOT NULL AND v_after NOT BETWEEN v_start AND v_end) OR
     ((p_after_date IS NULL) <> (p_after_key IS NULL)) OR (p_after_key NOT IN ('activities','sleep','hrv','body_battery','stress','daily_summary')) THEN
    RAISE EXCEPTION 'Cursore o revisione non validi' USING ERRCODE = '22023';
  END IF;
  IF p_revision <> v_revision THEN
    RAISE EXCEPTION 'Revisione cambiata' USING ERRCODE = '40001';
  END IF;
  RETURN (
    WITH candidates AS MATERIALIZED (
      SELECT * FROM coaching.import_coverage
      WHERE day BETWEEN v_start AND v_end
        AND (p_after_date IS NULL OR (day, source COLLATE "C") > (v_after,p_after_key::text COLLATE "C"))
      ORDER BY day, source COLLATE "C"
      LIMIT p_limit + 1
    ), page AS (
      SELECT * FROM candidates ORDER BY day, source COLLATE "C" LIMIT p_limit
    ), enriched AS (
      SELECT jsonb_build_object('date',day,'source',source,'attempt_state',attempt_state,'attempted_at',attempted_at,
        'evidence',evidence,'succeeded_at',succeeded_at,'item_count',item_count,'quality',quality,'error_code',error_code) AS item,
        jsonb_build_object('date',day,'key',source::text) AS cursor,
        row_number() OVER (ORDER BY day, source COLLATE "C") AS position
      FROM page
    )
    SELECT jsonb_build_object('revision',v_revision,'limit',p_limit,
      'count',(SELECT count(*) FROM page),
      'has_more',(SELECT count(*) > p_limit FROM candidates),
      'next_cursor', CASE WHEN (SELECT count(*) > p_limit FROM candidates)
        THEN (SELECT cursor FROM enriched WHERE position = p_limit) END,
      'rows',coalesce((SELECT jsonb_agg(item ORDER BY position) FROM enriched),'[]'::jsonb))
  );
END $$;
REVOKE ALL ON FUNCTION public.dashboard_coverage_v2(text,text,text,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_coverage_v2(text,text,text,integer,text,text) TO authenticated;

COMMIT;
