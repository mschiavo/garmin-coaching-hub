BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regclass('planning_private.plan_cycles') IS NULL
     OR pg_catalog.to_regclass('planning_private.planned_sessions') IS NULL
     OR pg_catalog.to_regclass('dashboard_private.allowed_users') IS NULL THEN
    RAISE EXCEPTION 'V4.1 Planning RPCs require migration 0036 and the dashboard allowlist';
  END IF;
END $$;

-- A serialized revision is the snapshot boundary used by list cursors. Updating
-- this singleton takes a transaction lock, so committed revisions cannot be
-- observed out of order even when concurrent writes allocate sequence values.
CREATE TABLE planning_private.api_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO planning_private.api_state(singleton, revision) VALUES (true, 0);
ALTER TABLE planning_private.api_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_private.api_state FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE planning_private.api_state FROM PUBLIC, anon, authenticated;

CREATE FUNCTION planning_private.require_allowed_user() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid;
BEGIN
  subject := auth.uid();
  IF subject IS NULL OR NOT EXISTS (
    SELECT 1 FROM dashboard_private.allowed_users a WHERE a.user_id = subject
  ) THEN
    RAISE EXCEPTION 'Planning access denied' USING ERRCODE = '42501';
  END IF;
  RETURN subject;
END $$;

CREATE FUNCTION planning_private.bump_api_revision() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE planning_private.api_state SET revision = revision + 1
  WHERE singleton RETURNING revision
$$;

CREATE FUNCTION planning_private.cycle_json(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', c.id::text, 'name', c.name, 'start_date', c.start_date::text,
    'end_date', c.end_date::text, 'timezone', c.timezone, 'status', c.status,
    'revision', c.revision::text
  ) FROM planning_private.plan_cycles c WHERE c.id = p_id
$$;

CREATE FUNCTION planning_private.session_json(p_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', s.id::text, 'cycle_id', s.cycle_id::text,
    'week_start', w.week_start::text, 'session_date', s.session_date::text,
    'sport', s.sport, 'session_type', s.session_type, 'title', s.title,
    'description', s.description, 'notes', s.notes,
    'target_distance_m', s.target_distance_m::text,
    'target_duration_s', s.target_duration_s::text, 'status', s.status,
    'completion_kind', s.completion_kind, 'revision', s.revision::text
  ) FROM planning_private.planned_sessions s
  LEFT JOIN planning_private.plan_weeks w ON w.id = s.week_id
  WHERE s.id = p_id
$$;

CREATE FUNCTION planning_private.encode_cursor(p_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.rtrim(pg_catalog.replace(
    pg_catalog.encode(pg_catalog.convert_to(p_value::text, 'UTF8'), 'base64'), E'\n', ''), '=')
$$;

CREATE FUNCTION public.planning_list_cycles_v1(
  p_status text DEFAULT NULL,
  p_start_from date DEFAULT NULL,
  p_start_to date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  api_revision bigint;
  cursor_value jsonb;
  last_start date;
  last_id uuid;
  total_count integer;
  result_rows jsonb;
  has_more boolean;
  next_value text;
BEGIN
  PERFORM planning_private.require_allowed_user();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR (p_status IS NOT NULL AND p_status NOT IN ('draft','active','completed','cancelled','archived'))
     OR (p_start_from IS NOT NULL AND NOT pg_catalog.isfinite(p_start_from))
     OR (p_start_to IS NOT NULL AND NOT pg_catalog.isfinite(p_start_to))
     OR (p_start_from IS NOT NULL AND p_start_to IS NOT NULL AND p_start_from > p_start_to) THEN
    RAISE EXCEPTION 'Invalid Planning cycle filters' USING ERRCODE = '22023';
  END IF;
  SELECT revision INTO api_revision FROM planning_private.api_state WHERE singleton FOR SHARE;
  IF p_cursor IS NOT NULL THEN
    BEGIN
      IF pg_catalog.length(p_cursor) > 2048 OR p_cursor !~ '^[A-Za-z0-9+/]+$' THEN
        RAISE EXCEPTION 'invalid cursor';
      END IF;
      cursor_value := pg_catalog.convert_from(pg_catalog.decode(
        p_cursor || pg_catalog.repeat('=', (4 - pg_catalog.length(p_cursor) % 4) % 4), 'base64'), 'UTF8')::jsonb;
      IF pg_catalog.jsonb_typeof(cursor_value) IS DISTINCT FROM 'object'
         OR cursor_value->>'v' IS DISTINCT FROM '1' OR cursor_value->>'revision' IS DISTINCT FROM api_revision::text
         OR cursor_value->>'status' IS DISTINCT FROM p_status
         OR cursor_value->>'start_from' IS DISTINCT FROM p_start_from::text
         OR cursor_value->>'start_to' IS DISTINCT FROM p_start_to::text
         OR cursor_value->>'last_start' IS NULL OR cursor_value->>'last_id' IS NULL THEN
        RAISE EXCEPTION 'stale or mismatched cursor' USING ERRCODE = '40001';
      END IF;
      last_start := (cursor_value->>'last_start')::date;
      last_id := (cursor_value->>'last_id')::uuid;
    EXCEPTION WHEN SQLSTATE '40001' THEN RAISE;
    WHEN OTHERS THEN RAISE EXCEPTION 'Invalid Planning cursor' USING ERRCODE = '22023';
    END;
  END IF;
  SELECT pg_catalog.count(*)::integer INTO total_count
  FROM planning_private.plan_cycles c
  WHERE (p_status IS NULL OR c.status = p_status)
    AND (p_start_from IS NULL OR c.start_date >= p_start_from)
    AND (p_start_to IS NULL OR c.start_date <= p_start_to);
  WITH page AS (
    SELECT c.* FROM planning_private.plan_cycles c
    WHERE (p_status IS NULL OR c.status = p_status)
      AND (p_start_from IS NULL OR c.start_date >= p_start_from)
      AND (p_start_to IS NULL OR c.start_date <= p_start_to)
      AND (last_start IS NULL OR (c.start_date, c.id) > (last_start, last_id))
    ORDER BY c.start_date, c.id LIMIT p_limit + 1
  ), numbered AS (SELECT page.*, pg_catalog.row_number() OVER (ORDER BY start_date,id) AS rn FROM page)
  SELECT coalesce(pg_catalog.jsonb_agg(planning_private.cycle_json(id) ORDER BY start_date,id)
           FILTER (WHERE rn <= p_limit), '[]'::jsonb), coalesce(pg_catalog.bool_or(rn > p_limit), false),
         pg_catalog.max(start_date) FILTER (WHERE rn = p_limit), (pg_catalog.max(id::text) FILTER (WHERE rn = p_limit))::uuid
  INTO result_rows, has_more, last_start, last_id FROM numbered;
  next_value := CASE WHEN has_more THEN planning_private.encode_cursor(pg_catalog.jsonb_build_object(
    'v',1,'revision',api_revision::text,'status',p_status,'start_from',p_start_from::text,
    'start_to',p_start_to::text,'last_start',last_start::text,'last_id',last_id::text)) ELSE NULL END;
  RETURN pg_catalog.jsonb_build_object('revision',api_revision::text,'count',total_count,
    'has_more',has_more,'next_cursor',next_value,'rows',result_rows);
END $$;

CREATE FUNCTION public.planning_get_cycle_v1(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM planning_private.require_allowed_user();
  PERFORM revision FROM planning_private.api_state WHERE singleton FOR SHARE;
  result := planning_private.cycle_json(p_id);
  IF result IS NULL THEN RAISE EXCEPTION 'Planning cycle unavailable' USING ERRCODE = '23503'; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'cycle', result,
    'weeks', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',w.id::text,'week_start',w.week_start::text,'ordinal',w.ordinal,'title',w.title,'note',w.note,
      'target_distance_m',w.target_distance_m::text,'target_duration_s',w.target_duration_s::text,
      'target_sessions',w.target_sessions,'revision',w.revision::text)
      ORDER BY w.week_start,w.ordinal,w.id) FROM planning_private.plan_weeks w WHERE w.cycle_id=p_id),'[]'::jsonb),
    'sessions', COALESCE((SELECT pg_catalog.jsonb_agg(planning_private.session_json(page.id)
      ORDER BY page.session_date,page.ordinal,page.id) FROM (
        SELECT s.id,s.session_date,s.ordinal FROM planning_private.planned_sessions s
        WHERE s.cycle_id=p_id ORDER BY s.session_date,s.ordinal,s.id LIMIT 100
      ) page),'[]'::jsonb),
    'sessions_has_more', EXISTS (SELECT 1 FROM planning_private.planned_sessions s
      WHERE s.cycle_id=p_id ORDER BY s.session_date,s.ordinal,s.id OFFSET 100 LIMIT 1));
END $$;

CREATE FUNCTION public.planning_create_cycle_v1(
  p_name text, p_start_date date, p_end_date date, p_timezone text, p_status text DEFAULT 'draft'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; new_id uuid; row_revision bigint; api_revision bigint;
BEGIN
  subject := planning_private.require_allowed_user();
  IF p_status IS NULL OR p_status NOT IN ('draft','active') OR p_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 120
     OR p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date
     OR p_end_date - p_start_date > 1095 OR p_timezone IS NULL THEN
    RAISE EXCEPTION 'Invalid Planning cycle' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(7410037, 1);
  IF p_status = 'active' AND EXISTS (SELECT 1 FROM planning_private.plan_cycles c
      WHERE c.status='active' AND c.start_date <= p_end_date AND c.end_date >= p_start_date) THEN
    RAISE EXCEPTION 'Active cycle overlaps an existing cycle' USING ERRCODE = '23505';
  END IF;
  INSERT INTO planning_private.plan_cycles(name,start_date,end_date,timezone,status)
  VALUES (pg_catalog.btrim(p_name),p_start_date,p_end_date,p_timezone,p_status)
  RETURNING id,revision INTO new_id,row_revision;
  api_revision := planning_private.bump_api_revision();
  INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
  VALUES ('cycle',new_id,row_revision,'created',subject);
  RETURN pg_catalog.jsonb_build_object('revision',api_revision::text,'cycle',planning_private.cycle_json(new_id));
END $$;

CREATE FUNCTION public.planning_update_cycle_v1(p_id uuid,p_expected_revision text,p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; current_row planning_private.plan_cycles%ROWTYPE; changed planning_private.plan_cycles%ROWTYPE; api_revision bigint;
BEGIN
  subject := planning_private.require_allowed_user();
  IF p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS keys(key)
       WHERE key NOT IN ('name','start_date','end_date','status')) THEN
    RAISE EXCEPTION 'Invalid Planning cycle patch' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO current_row FROM planning_private.plan_cycles WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning cycle unavailable' USING ERRCODE = '23503'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision !~ '^[1-9][0-9]{0,18}$'
     OR current_row.revision::text <> p_expected_revision THEN
    RAISE EXCEPTION 'Planning cycle revision conflict' USING ERRCODE = '40001';
  END IF;
  IF current_row.status IN ('completed','cancelled','archived')
     AND (p_patch ?| ARRAY['name','start_date','end_date']) THEN
    RAISE EXCEPTION 'Terminal Planning cycle cannot be edited' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'status' AND NOT (
    (current_row.status='draft' AND p_patch->>'status' IN ('draft','active','cancelled')) OR
    (current_row.status='active' AND p_patch->>'status' IN ('active','completed','cancelled')) OR
    (current_row.status='completed' AND p_patch->>'status' IN ('completed','archived')) OR
    (current_row.status='cancelled' AND p_patch->>'status'='cancelled') OR
    (current_row.status='archived' AND p_patch->>'status'='archived')) THEN
    RAISE EXCEPTION 'Invalid Planning cycle transition' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_patch->>'status',current_row.status)='active' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(7410037, 1);
    IF EXISTS (SELECT 1 FROM planning_private.plan_cycles c WHERE c.status='active' AND c.id<>p_id
      AND c.start_date <= coalesce((p_patch->>'end_date')::date,current_row.end_date)
      AND c.end_date >= coalesce((p_patch->>'start_date')::date,current_row.start_date)) THEN
      RAISE EXCEPTION 'Active cycle overlaps an existing cycle' USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE planning_private.plan_cycles SET
    name=CASE WHEN p_patch ? 'name' THEN p_patch->>'name' ELSE current_row.name END,
    start_date=CASE WHEN p_patch ? 'start_date' THEN (p_patch->>'start_date')::date ELSE current_row.start_date END,
    end_date=CASE WHEN p_patch ? 'end_date' THEN (p_patch->>'end_date')::date ELSE current_row.end_date END,
    status=CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE current_row.status END
  WHERE id=p_id RETURNING * INTO changed;
  api_revision := planning_private.bump_api_revision();
  INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
  VALUES ('cycle',p_id,changed.revision,CASE WHEN changed.status='cancelled' AND current_row.status<>'cancelled' THEN 'cancelled' ELSE 'edited' END,subject);
  RETURN pg_catalog.jsonb_build_object('revision',api_revision::text,'cycle',planning_private.cycle_json(p_id));
END $$;

CREATE FUNCTION public.planning_cancel_cycle_v1(p_id uuid,p_expected_revision text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN public.planning_update_cycle_v1(p_id,p_expected_revision,pg_catalog.jsonb_build_object('status','cancelled'));
END $$;

CREATE FUNCTION public.planning_list_sessions_v1(
  p_start_date date DEFAULT NULL,p_end_date date DEFAULT NULL,p_cycle_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,p_limit integer DEFAULT 50,p_cursor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; api_revision bigint; cursor_value jsonb; last_date date; last_ordinal integer; last_id uuid;
  total_count integer; result_rows jsonb; has_more boolean; next_cursor text;
BEGIN
  subject := planning_private.require_allowed_user();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR (p_start_date IS NOT NULL AND NOT pg_catalog.isfinite(p_start_date))
     OR (p_end_date IS NOT NULL AND NOT pg_catalog.isfinite(p_end_date))
     OR (p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date>p_end_date)
     OR (p_status IS NOT NULL AND p_status NOT IN ('planned','completed','skipped','cancelled')) THEN
    RAISE EXCEPTION 'Invalid Planning session filters' USING ERRCODE = '22023';
  END IF;
  SELECT revision INTO api_revision FROM planning_private.api_state WHERE singleton FOR SHARE;
  IF p_cursor IS NOT NULL THEN
    BEGIN
      IF pg_catalog.length(p_cursor)>2048 OR p_cursor !~ '^[A-Za-z0-9+/]+$' THEN RAISE EXCEPTION 'invalid'; END IF;
      cursor_value := pg_catalog.convert_from(pg_catalog.decode(p_cursor||pg_catalog.repeat('=',(4-pg_catalog.length(p_cursor)%4)%4),'base64'),'UTF8')::jsonb;
      IF pg_catalog.jsonb_typeof(cursor_value) IS DISTINCT FROM 'object'
        OR cursor_value->>'v' IS DISTINCT FROM '1' OR cursor_value->>'revision' IS DISTINCT FROM api_revision::text
        OR cursor_value->>'start_date' IS DISTINCT FROM p_start_date::text
        OR cursor_value->>'end_date' IS DISTINCT FROM p_end_date::text
        OR cursor_value->>'cycle_id' IS DISTINCT FROM p_cycle_id::text
        OR cursor_value->>'status' IS DISTINCT FROM p_status
        OR cursor_value->>'last_date' IS NULL OR cursor_value->>'last_ordinal' IS NULL
        OR cursor_value->>'last_id' IS NULL THEN
        RAISE EXCEPTION 'stale or mismatched cursor' USING ERRCODE='40001';
      END IF;
      last_date:=(cursor_value->>'last_date')::date; last_ordinal:=(cursor_value->>'last_ordinal')::integer;
      last_id:=(cursor_value->>'last_id')::uuid;
    EXCEPTION WHEN SQLSTATE '40001' THEN RAISE;
    WHEN OTHERS THEN RAISE EXCEPTION 'Invalid Planning cursor' USING ERRCODE='22023'; END;
  END IF;
  SELECT count(*)::integer INTO total_count FROM planning_private.planned_sessions s
  WHERE (p_start_date IS NULL OR s.session_date>=p_start_date) AND (p_end_date IS NULL OR s.session_date<=p_end_date)
   AND (p_cycle_id IS NULL OR s.cycle_id=p_cycle_id) AND (p_status IS NULL OR s.status=p_status);
  WITH page AS (SELECT s.* FROM planning_private.planned_sessions s
    WHERE (p_start_date IS NULL OR s.session_date>=p_start_date) AND (p_end_date IS NULL OR s.session_date<=p_end_date)
     AND (p_cycle_id IS NULL OR s.cycle_id=p_cycle_id) AND (p_status IS NULL OR s.status=p_status)
     AND (last_date IS NULL OR (s.session_date,s.ordinal,s.id)>(last_date,last_ordinal,last_id))
    ORDER BY s.session_date,s.ordinal,s.id LIMIT p_limit+1),
  numbered AS (SELECT page.*,row_number() OVER (ORDER BY session_date,ordinal,id) rn FROM page)
  SELECT coalesce(jsonb_agg(planning_private.session_json(id) ORDER BY session_date,ordinal,id) FILTER(WHERE rn<=p_limit),'[]'::jsonb),
    coalesce(bool_or(rn>p_limit),false),max(session_date) FILTER(WHERE rn=p_limit),
    max(ordinal) FILTER(WHERE rn=p_limit),(max(id::text) FILTER(WHERE rn=p_limit))::uuid
  INTO result_rows,has_more,last_date,last_ordinal,last_id FROM numbered;
  next_cursor:=CASE WHEN has_more THEN planning_private.encode_cursor(jsonb_build_object('v',1,'revision',api_revision::text,
    'start_date',p_start_date::text,'end_date',p_end_date::text,'cycle_id',p_cycle_id::text,'status',p_status,
    'last_date',last_date::text,'last_ordinal',last_ordinal,'last_id',last_id::text)) ELSE NULL END;
  RETURN jsonb_build_object('revision',api_revision::text,'count',total_count,'has_more',has_more,'next_cursor',next_cursor,'rows',result_rows);
END $$;

CREATE FUNCTION public.planning_get_session_v1(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM planning_private.require_allowed_user(); result:=planning_private.session_json(p_id);
  IF result IS NULL THEN RAISE EXCEPTION 'Planning session unavailable' USING ERRCODE='23503'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.planning_create_session_v1(
  p_session_date date,p_sport text,p_session_type text,p_title text,
  p_cycle_id uuid DEFAULT NULL,p_week_start date DEFAULT NULL,p_ordinal integer DEFAULT 0,
  p_target_distance_m numeric DEFAULT NULL,p_target_duration_s numeric DEFAULT NULL,
  p_description text DEFAULT NULL,p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; week_ident uuid; new_id uuid; row_revision bigint; api_revision bigint; cycle_status text;
BEGIN
  subject:=planning_private.require_allowed_user();
  IF p_session_date IS NULL OR NOT pg_catalog.isfinite(p_session_date) OR p_sport IS NULL OR p_sport NOT IN ('running','cycling','swimming','strength','other','rest')
    OR p_session_type IS NULL OR pg_catalog.length(pg_catalog.btrim(p_session_type)) NOT BETWEEN 1 AND 60
    OR p_title IS NULL OR pg_catalog.length(pg_catalog.btrim(p_title)) NOT BETWEEN 1 AND 160
    OR p_ordinal NOT BETWEEN 0 AND 1000 OR (p_description IS NOT NULL AND pg_catalog.length(p_description)>2000)
    OR (p_notes IS NOT NULL AND pg_catalog.length(p_notes)>2000)
    OR (p_sport='rest' AND (p_target_distance_m IS NOT NULL OR p_target_duration_s IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Planning session' USING ERRCODE='22023';
  END IF;
  IF p_cycle_id IS NOT NULL THEN
    SELECT c.status INTO cycle_status FROM planning_private.plan_cycles c WHERE c.id=p_cycle_id FOR SHARE;
    IF NOT FOUND OR cycle_status NOT IN ('draft','active') THEN
      RAISE EXCEPTION 'Planning cycle unavailable' USING ERRCODE='23503';
    END IF;
  END IF;
  IF p_week_start IS NOT NULL THEN
    IF extract(isodow FROM p_week_start)<>1 THEN RAISE EXCEPTION 'Week start must be Monday' USING ERRCODE='22023'; END IF;
    IF p_cycle_id IS NULL THEN RAISE EXCEPTION 'Week requires a cycle' USING ERRCODE='22023'; END IF;
    SELECT id INTO week_ident FROM planning_private.plan_weeks WHERE cycle_id=p_cycle_id AND week_start=p_week_start;
    IF week_ident IS NULL THEN
      INSERT INTO planning_private.plan_weeks(cycle_id,week_start) VALUES(p_cycle_id,p_week_start) RETURNING id INTO week_ident;
      INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
      VALUES('week',week_ident,1,'created',subject);
    END IF;
  END IF;
  INSERT INTO planning_private.planned_sessions(cycle_id,week_id,session_date,sport,session_type,title,description,notes,ordinal,target_distance_m,target_duration_s)
  VALUES(p_cycle_id,week_ident,p_session_date,p_sport,pg_catalog.btrim(p_session_type),pg_catalog.btrim(p_title),p_description,p_notes,p_ordinal,p_target_distance_m,p_target_duration_s)
  RETURNING id,revision INTO new_id,row_revision;
  api_revision:=planning_private.bump_api_revision();
  INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
  VALUES('session',new_id,row_revision,'created',subject);
  RETURN jsonb_build_object('revision',api_revision::text,'session',planning_private.session_json(new_id));
END $$;

CREATE FUNCTION public.planning_update_session_v1(p_id uuid,p_expected_revision text,p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; current_row planning_private.planned_sessions%ROWTYPE; changed planning_private.planned_sessions%ROWTYPE;
  api_revision bigint; cycle_status text;
BEGIN
  subject:=planning_private.require_allowed_user();
  IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR p_patch='{}'::jsonb
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS keys(key) WHERE key NOT IN ('sport','session_type','title','description','notes','ordinal','target_distance_m','target_duration_s')) THEN
    RAISE EXCEPTION 'Invalid Planning session patch' USING ERRCODE='22023';
  END IF;
  SELECT * INTO current_row FROM planning_private.planned_sessions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning session unavailable' USING ERRCODE='23503'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision !~ '^[1-9][0-9]{0,18}$' OR current_row.revision::text<>p_expected_revision THEN
    RAISE EXCEPTION 'Planning session revision conflict' USING ERRCODE='40001'; END IF;
  IF current_row.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Planning session is immutable in this state' USING ERRCODE='22023'; END IF;
  IF current_row.cycle_id IS NOT NULL THEN
    SELECT c.status INTO cycle_status FROM planning_private.plan_cycles c WHERE c.id=current_row.cycle_id FOR SHARE;
    IF NOT FOUND OR cycle_status NOT IN ('draft','active') THEN
      RAISE EXCEPTION 'Planning cycle unavailable' USING ERRCODE='23503';
    END IF;
  END IF;
  UPDATE planning_private.planned_sessions SET
    sport=CASE WHEN p_patch?'sport' THEN p_patch->>'sport' ELSE current_row.sport END,
    session_type=CASE WHEN p_patch?'session_type' THEN p_patch->>'session_type' ELSE current_row.session_type END,
    title=CASE WHEN p_patch?'title' THEN p_patch->>'title' ELSE current_row.title END,
    description=CASE WHEN p_patch?'description' THEN p_patch->>'description' ELSE current_row.description END,
    notes=CASE WHEN p_patch?'notes' THEN p_patch->>'notes' ELSE current_row.notes END,
    ordinal=CASE WHEN p_patch?'ordinal' THEN (p_patch->>'ordinal')::integer ELSE current_row.ordinal END,
    target_distance_m=CASE WHEN p_patch?'target_distance_m' THEN (p_patch->>'target_distance_m')::numeric ELSE current_row.target_distance_m END,
    target_duration_s=CASE WHEN p_patch?'target_duration_s' THEN (p_patch->>'target_duration_s')::numeric ELSE current_row.target_duration_s END
  WHERE id=p_id RETURNING * INTO changed;
  api_revision:=planning_private.bump_api_revision();
  INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
  VALUES('session',p_id,changed.revision,'edited',subject);
  RETURN jsonb_build_object('revision',api_revision::text,'session',planning_private.session_json(p_id));
END $$;

CREATE FUNCTION public.planning_reschedule_session_v1(p_id uuid,p_expected_revision text,p_session_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; current_row planning_private.planned_sessions%ROWTYPE; changed planning_private.planned_sessions%ROWTYPE;
  api_revision bigint; week_ident uuid; new_week_start date; cycle_status text;
BEGIN
  subject:=planning_private.require_allowed_user();
  SELECT * INTO current_row FROM planning_private.planned_sessions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning session unavailable' USING ERRCODE='23503'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision !~ '^[1-9][0-9]{0,18}$' OR current_row.revision::text<>p_expected_revision THEN
    RAISE EXCEPTION 'Planning session revision conflict' USING ERRCODE='40001'; END IF;
  IF current_row.status IN ('completed','cancelled') OR p_session_date IS NULL OR NOT pg_catalog.isfinite(p_session_date) THEN
    RAISE EXCEPTION 'Invalid Planning reschedule' USING ERRCODE='22023'; END IF;
  IF current_row.cycle_id IS NOT NULL THEN
    SELECT c.status INTO cycle_status FROM planning_private.plan_cycles c WHERE c.id=current_row.cycle_id FOR SHARE;
    IF NOT FOUND OR cycle_status NOT IN ('draft','active') THEN
      RAISE EXCEPTION 'Planning cycle unavailable' USING ERRCODE='23503';
    END IF;
  END IF;
  IF current_row.week_id IS NOT NULL THEN
    new_week_start := (p_session_date - (extract(isodow FROM p_session_date)::integer-1))::date;
    SELECT id INTO week_ident FROM planning_private.plan_weeks
    WHERE cycle_id=current_row.cycle_id AND week_start=new_week_start;
    IF week_ident IS NULL THEN
      INSERT INTO planning_private.plan_weeks(cycle_id,week_start)
      VALUES(current_row.cycle_id,new_week_start) RETURNING id INTO week_ident;
      INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
      VALUES('week',week_ident,1,'created',subject);
    END IF;
  END IF;
  UPDATE planning_private.planned_sessions SET session_date=p_session_date,week_id=week_ident WHERE id=p_id RETURNING * INTO changed;
  api_revision:=planning_private.bump_api_revision();
  INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
  VALUES('session',p_id,changed.revision,'rescheduled',subject);
  RETURN jsonb_build_object('revision',api_revision::text,'session',planning_private.session_json(p_id));
END $$;

CREATE FUNCTION public.planning_set_session_status_v1(p_id uuid,p_expected_revision text,p_status text,p_origin text DEFAULT 'manual') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE subject uuid; current_row planning_private.planned_sessions%ROWTYPE; changed planning_private.planned_sessions%ROWTYPE;
  api_revision bigint; event_name text; cycle_status text;
BEGIN
  subject:=planning_private.require_allowed_user();
  IF p_origin IS DISTINCT FROM 'manual' OR p_status IS NULL OR p_status NOT IN ('planned','completed','skipped','cancelled') THEN
    RAISE EXCEPTION 'Invalid Planning session status' USING ERRCODE='22023'; END IF;
  SELECT * INTO current_row FROM planning_private.planned_sessions WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Planning session unavailable' USING ERRCODE='23503'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision !~ '^[1-9][0-9]{0,18}$' OR current_row.revision::text<>p_expected_revision THEN
    RAISE EXCEPTION 'Planning session revision conflict' USING ERRCODE='40001'; END IF;
  IF current_row.cycle_id IS NOT NULL THEN
    SELECT c.status INTO cycle_status FROM planning_private.plan_cycles c WHERE c.id=current_row.cycle_id FOR SHARE;
    IF NOT FOUND OR cycle_status NOT IN ('draft','active') THEN
      RAISE EXCEPTION 'Planning cycle unavailable' USING ERRCODE='23503';
    END IF;
  END IF;
  IF current_row.status IN ('completed','cancelled') OR current_row.status=p_status
     OR (current_row.status='skipped' AND p_status NOT IN ('skipped','cancelled'))
     OR (current_row.status='planned' AND p_status='planned') THEN
    RAISE EXCEPTION 'Invalid Planning session transition' USING ERRCODE='22023'; END IF;
  UPDATE planning_private.planned_sessions SET status=p_status,
    completion_kind=CASE WHEN p_status='completed' THEN 'manual' ELSE NULL END
    WHERE id=p_id RETURNING * INTO changed;
  api_revision:=planning_private.bump_api_revision();
  event_name:=CASE WHEN p_status='cancelled' THEN 'cancelled' ELSE 'edited' END;
  INSERT INTO planning_private.plan_change_events(entity_kind,entity_id,revision,event_kind,actor_id)
  VALUES('session',p_id,changed.revision,event_name,subject);
  RETURN jsonb_build_object('revision',api_revision::text,'session',planning_private.session_json(p_id));
END $$;

REVOKE ALL ON FUNCTION planning_private.require_allowed_user() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION planning_private.bump_api_revision() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION planning_private.cycle_json(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION planning_private.session_json(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION planning_private.encode_cursor(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE planning_private.api_state FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.planning_list_cycles_v1(text,date,date,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_get_cycle_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_create_cycle_v1(text,date,date,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_update_cycle_v1(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_cancel_cycle_v1(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_list_sessions_v1(date,date,uuid,text,integer,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_get_session_v1(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_create_session_v1(date,text,text,text,uuid,date,integer,numeric,numeric,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_update_session_v1(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_reschedule_session_v1(uuid,text,date) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.planning_set_session_status_v1(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.planning_list_cycles_v1(text,date,date,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_get_cycle_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_create_cycle_v1(text,date,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_update_cycle_v1(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_cancel_cycle_v1(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_list_sessions_v1(date,date,uuid,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_get_session_v1(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_create_session_v1(date,text,text,text,uuid,date,integer,numeric,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_update_session_v1(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_reschedule_session_v1(uuid,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.planning_set_session_status_v1(uuid,text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
