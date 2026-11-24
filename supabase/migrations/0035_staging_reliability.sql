BEGIN;

DO $$
BEGIN
  IF to_regclass('coaching.intelligence_state') IS NULL
     OR to_regclass('coaching.import_coverage') IS NULL
     OR to_regprocedure('public.dashboard_metadata_v2(text,text)') IS NULL THEN
    RAISE EXCEPTION 'Installare prima la migrazione 0034';
  END IF;
  IF NOT EXISTS (SELECT FROM coaching.intelligence_state WHERE singleton AND schema_version = 34) THEN
    RAISE EXCEPTION 'Atteso schema API 34';
  END IF;
END $$;

ALTER TABLE coaching.import_coverage
  ADD COLUMN IF NOT EXISTS reconciliation text
    CHECK (reconciliation IN ('verified','conflict','invalidated')),
  ADD COLUMN IF NOT EXISTS observed_count integer CHECK (observed_count >= 0),
  ADD COLUMN IF NOT EXISTS missing_count integer CHECK (missing_count >= 0);

-- The existing statement trigger must also work for a legacy writer that has
-- privileges on the Garmin tables alone. This function is trigger-only.
ALTER FUNCTION coaching.bump_intelligence_revision() SECURITY DEFINER;

-- Serialize archive mutations before row locks. The writer also takes this
-- transaction lock before the read/merge/compare sequence.
CREATE OR REPLACE FUNCTION coaching.lock_archive_mutations() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(340035);
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION coaching.invalidate_archive_coverage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_day date;
  new_day date;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    UPDATE coaching.import_coverage SET reconciliation = 'invalidated'
    WHERE reconciliation IN ('verified','conflict')
      AND (source = 'activities') = (TG_TABLE_NAME = 'garmin_activities');
  ELSIF TG_TABLE_NAME = 'garmin_activities' THEN
    IF TG_OP <> 'INSERT' THEN old_day := OLD.activity_date; END IF;
    IF TG_OP <> 'DELETE' THEN new_day := NEW.activity_date; END IF;
    IF EXISTS (SELECT FROM coaching.import_coverage WHERE day IN (old_day, new_day)
               AND source = 'activities' AND reconciliation IN ('verified','conflict')) THEN
      UPDATE coaching.import_coverage SET reconciliation = 'invalidated'
      WHERE day IN (old_day, new_day) AND source = 'activities'
        AND reconciliation IN ('verified','conflict');
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_day := OLD.metric_date; END IF;
    IF TG_OP <> 'DELETE' THEN new_day := NEW.metric_date; END IF;
    UPDATE coaching.import_coverage SET reconciliation = 'invalidated'
    WHERE day IN (old_day, new_day) AND source <> 'activities'
      AND reconciliation IN ('verified','conflict')
      AND (TG_OP <> 'UPDATE' OR old_day <> new_day OR
           (to_jsonb(OLD) -> CASE WHEN source = 'daily_summary' THEN source ELSE source || '_data' END)
           IS DISTINCT FROM
           (to_jsonb(NEW) -> CASE WHEN source = 'daily_summary' THEN source ELSE source || '_data' END));
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION coaching.reset_legacy_attestation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.attempt_state IN ('success_empty','success_with_data')
     AND (NEW.attempted_at,NEW.succeeded_at) IS DISTINCT FROM (OLD.attempted_at,OLD.succeeded_at) THEN
    NEW.reconciliation := NULL;
    NEW.observed_count := NULL;
    NEW.missing_count := NULL;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION coaching.lock_archive_mutations(), coaching.invalidate_archive_coverage(),
  coaching.reset_legacy_attestation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER archive_mutation_lock
  BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON coaching.import_coverage
  FOR EACH STATEMENT EXECUTE FUNCTION coaching.lock_archive_mutations();
CREATE OR REPLACE TRIGGER reset_legacy_attestation BEFORE UPDATE ON coaching.import_coverage
  FOR EACH ROW EXECUTE FUNCTION coaching.reset_legacy_attestation();

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['garmin_activities','garmin_daily_metrics'] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER archive_mutation_lock BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON coaching.%I FOR EACH STATEMENT EXECUTE FUNCTION coaching.lock_archive_mutations()', target);
    EXECUTE format('CREATE OR REPLACE TRIGGER invalidate_archive_row AFTER INSERT OR UPDATE OR DELETE ON coaching.%I FOR EACH ROW EXECUTE FUNCTION coaching.invalidate_archive_coverage()', target);
    EXECUTE format('CREATE OR REPLACE TRIGGER invalidate_archive_truncate AFTER TRUNCATE ON coaching.%I FOR EACH STATEMENT EXECUTE FUNCTION coaching.invalidate_archive_coverage()', target);
  END LOOP;
END $$;


CREATE OR REPLACE FUNCTION public.dashboard_metadata_v2(p_start text DEFAULT '0001-01-01', p_end text DEFAULT '9999-12-31')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_revision text := dashboard_private.check_v2(p_start,p_end,250);
  v_start date := dashboard_private.iso_date_v2(p_start);
  v_end date := dashboard_private.iso_date_v2(p_end);
BEGIN
  RETURN jsonb_build_object('api_version',2,'schema_version',34,'revision',v_revision,'reliability_version',1,
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
        'evidence',evidence,'succeeded_at',succeeded_at,'item_count',item_count,'quality',quality,'error_code',error_code,
        'reconciliation',reconciliation,'observed_count',observed_count,'missing_count',missing_count) AS item,
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
