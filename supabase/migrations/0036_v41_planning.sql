BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regclass('coaching.garmin_activities') IS NULL
     OR pg_catalog.to_regclass('dashboard_private.allowed_users') IS NULL
     OR pg_catalog.to_regclass('coaching.intelligence_state') IS NULL THEN
    RAISE EXCEPTION 'V4.1 planning requires bootstrap, dashboard, 0034 and 0035';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM coaching.intelligence_state WHERE singleton AND schema_version = 34
  ) THEN
    RAISE EXCEPTION 'V4.1 planning requires archive schema version 34';
  END IF;
END $$;

CREATE SCHEMA planning_private;
REVOKE ALL ON SCHEMA planning_private FROM PUBLIC, anon, authenticated;

CREATE TABLE planning_private.plan_cycles (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(name)) BETWEEN 1 AND 120),
  start_date date NOT NULL,
  end_date date NOT NULL,
  timezone text NOT NULL CHECK (pg_catalog.length(timezone) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','completed','cancelled','archived')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (pg_catalog.isfinite(start_date) AND pg_catalog.isfinite(end_date)),
  CHECK (start_date <= end_date),
  CHECK (end_date - start_date <= 1095)
);

CREATE TABLE planning_private.plan_weeks (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES planning_private.plan_cycles(id) ON DELETE RESTRICT,
  week_start date NOT NULL CHECK (pg_catalog.isfinite(week_start) AND extract(isodow FROM week_start) = 1),
  ordinal integer NOT NULL DEFAULT 0 CHECK (ordinal BETWEEN 0 AND 1000),
  title text CHECK (title IS NULL OR pg_catalog.length(title) <= 120),
  note text CHECK (note IS NULL OR pg_catalog.length(note) <= 2000),
  target_distance_m numeric(14,2) CHECK (target_distance_m IS NULL OR
    (target_distance_m > 0 AND target_distance_m < 'Infinity'::numeric)),
  target_duration_s numeric(14,2) CHECK (target_duration_s IS NULL OR
    (target_duration_s > 0 AND target_duration_s < 'Infinity'::numeric)),
  target_sessions integer CHECK (target_sessions IS NULL OR target_sessions >= 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (id, cycle_id),
  UNIQUE (cycle_id, week_start)
);

CREATE TABLE planning_private.planned_sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  cycle_id uuid REFERENCES planning_private.plan_cycles(id) ON DELETE RESTRICT,
  week_id uuid,
  session_date date NOT NULL CHECK (pg_catalog.isfinite(session_date)),
  sport text NOT NULL CHECK (sport IN ('running','cycling','swimming','strength','other','rest')),
  session_type text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(session_type)) BETWEEN 1 AND 60),
  title text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(title)) BETWEEN 1 AND 160),
  description text CHECK (description IS NULL OR pg_catalog.length(description) <= 2000),
  notes text CHECK (notes IS NULL OR pg_catalog.length(notes) <= 2000),
  ordinal integer NOT NULL DEFAULT 0 CHECK (ordinal BETWEEN 0 AND 1000),
  target_distance_m numeric(14,2) CHECK (target_distance_m IS NULL OR
    (target_distance_m > 0 AND target_distance_m < 'Infinity'::numeric)),
  target_duration_s numeric(14,2) CHECK (target_duration_s IS NULL OR
    (target_duration_s > 0 AND target_duration_s < 'Infinity'::numeric)),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','completed','skipped','cancelled')),
  completion_kind text CHECK (completion_kind IN ('manual','verified')),
  superseded_by uuid REFERENCES planning_private.planned_sessions(id) ON DELETE RESTRICT,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK ((status = 'completed') = (completion_kind IS NOT NULL)),
  CHECK (sport <> 'rest' OR (target_distance_m IS NULL AND target_duration_s IS NULL)),
  CHECK (week_id IS NULL OR cycle_id IS NOT NULL),
  FOREIGN KEY (week_id, cycle_id)
    REFERENCES planning_private.plan_weeks(id, cycle_id) ON DELETE RESTRICT
);

CREATE TABLE planning_private.training_goals (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  cycle_id uuid REFERENCES planning_private.plan_cycles(id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('week','month','block','race')),
  metric text NOT NULL CHECK (metric IN ('distance','duration','sessions','race_time')),
  target numeric(14,2) NOT NULL CHECK (target >= 0 AND target < 'Infinity'::numeric),
  unit text NOT NULL CHECK (unit IN ('m','s','sessions')),
  direction text NOT NULL CHECK (direction IN ('at_least','lower_is_better')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  timezone text NOT NULL CHECK (pg_catalog.length(timezone) BETWEEN 1 AND 100),
  event_name text CHECK (event_name IS NULL OR pg_catalog.length(event_name) <= 160),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','completed','cancelled','archived')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (pg_catalog.isfinite(start_date) AND pg_catalog.isfinite(end_date)),
  CHECK (start_date <= end_date),
  CHECK (end_date - start_date <= 1095),
  CHECK (
    (metric = 'distance' AND unit = 'm' AND target > 0 AND direction = 'at_least') OR
    (metric = 'duration' AND unit = 's' AND target > 0 AND direction = 'at_least') OR
    (metric = 'sessions' AND unit = 'sessions' AND target = pg_catalog.trunc(target)
      AND direction = 'at_least') OR
    (metric = 'race_time' AND unit = 's' AND target > 0 AND direction = 'lower_is_better')
  ),
  CHECK ((scope = 'race') = (metric = 'race_time')),
  CHECK ((scope = 'race') = (event_name IS NOT NULL))
);

CREATE TABLE planning_private.goal_milestones (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES planning_private.training_goals(id) ON DELETE RESTRICT,
  due_date date NOT NULL CHECK (pg_catalog.isfinite(due_date)),
  target numeric(14,2) NOT NULL CHECK (target >= 0 AND target < 'Infinity'::numeric),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 1000),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (goal_id, due_date),
  UNIQUE (goal_id, ordinal)
);

CREATE TABLE planning_private.session_activity_links (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES planning_private.planned_sessions(id) ON DELETE RESTRICT,
  activity_id bigint NOT NULL CHECK (activity_id > 0),
  link_source text NOT NULL DEFAULT 'manual' CHECK (link_source = 'manual'),
  verification_state text NOT NULL DEFAULT 'verified'
    CHECK (verification_state IN ('verified','needs_review','unresolved')),
  linked_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  unlinked_at timestamptz,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (unlinked_at IS NULL OR unlinked_at >= linked_at)
);

CREATE TABLE planning_private.plan_change_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_kind text NOT NULL CHECK (entity_kind IN ('cycle','week','session','goal','milestone','activity_link')),
  entity_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  event_kind text NOT NULL CHECK (event_kind IN ('created','edited','rescheduled','cancelled','linked','unlinked')),
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  actor_id uuid
);

CREATE UNIQUE INDEX session_activity_one_active_link
  ON planning_private.session_activity_links(activity_id) WHERE unlinked_at IS NULL;
CREATE INDEX session_activity_session_active_idx
  ON planning_private.session_activity_links(session_id, linked_at DESC) WHERE unlinked_at IS NULL;
CREATE INDEX planned_sessions_date_idx
  ON planning_private.planned_sessions(session_date, ordinal, id);
CREATE INDEX planned_sessions_cycle_date_idx
  ON planning_private.planned_sessions(cycle_id, session_date, ordinal, id) WHERE cycle_id IS NOT NULL;
CREATE INDEX training_goals_period_idx
  ON planning_private.training_goals(status, start_date, end_date, id);
CREATE INDEX goal_milestones_goal_date_idx
  ON planning_private.goal_milestones(goal_id, due_date, id);
CREATE INDEX plan_events_entity_idx
  ON planning_private.plan_change_events(entity_kind, entity_id, id DESC);

CREATE FUNCTION planning_private.validate_cycle_dates() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = NEW.timezone)
     OR (NEW.timezone <> 'UTC' AND NEW.timezone !~ '^[A-Za-z0-9._+-]+(/[A-Za-z0-9._+-]+)+$') THEN
    RAISE EXCEPTION 'Unknown IANA timezone' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.timezone IS DISTINCT FROM OLD.timezone THEN
    RAISE EXCEPTION 'Cycle timezone is immutable' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    EXISTS (SELECT 1 FROM planning_private.plan_weeks w
      WHERE w.cycle_id = OLD.id AND (w.week_start > NEW.end_date OR w.week_start + 6 < NEW.start_date)) OR
    EXISTS (SELECT 1 FROM planning_private.planned_sessions s
      WHERE s.cycle_id = OLD.id AND s.session_date NOT BETWEEN NEW.start_date AND NEW.end_date) OR
    EXISTS (SELECT 1 FROM planning_private.training_goals g
      WHERE g.cycle_id = OLD.id AND (g.start_date < NEW.start_date OR g.end_date > NEW.end_date))
  ) THEN
    RAISE EXCEPTION 'Cycle range conflicts with existing planning data' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION planning_private.validate_goal_period() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = NEW.timezone)
     OR (NEW.timezone <> 'UTC' AND NEW.timezone !~ '^[A-Za-z0-9._+-]+(/[A-Za-z0-9._+-]+)+$') THEN
    RAISE EXCEPTION 'Unknown IANA timezone' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.timezone IS DISTINCT FROM OLD.timezone THEN
    RAISE EXCEPTION 'Goal timezone is immutable' USING ERRCODE = '22023';
  END IF;
  IF NEW.cycle_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM planning_private.plan_cycles c
    WHERE c.id = NEW.cycle_id AND NEW.start_date >= c.start_date AND NEW.end_date <= c.end_date
      AND NEW.timezone = c.timezone
  ) THEN
    RAISE EXCEPTION 'Goal period must fit its cycle and timezone' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION planning_private.validate_milestone() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE goal_metric text; goal_start date; goal_end date;
BEGIN
  SELECT metric, start_date, end_date INTO goal_metric, goal_start, goal_end
  FROM planning_private.training_goals WHERE id = NEW.goal_id;
  IF NOT FOUND OR NEW.due_date NOT BETWEEN goal_start AND goal_end THEN
    RAISE EXCEPTION 'Milestone date must fit its goal period' USING ERRCODE = '22023';
  END IF;
  IF goal_metric = 'sessions' AND NEW.target <> pg_catalog.trunc(NEW.target) THEN
    RAISE EXCEPTION 'Session milestone target must be an integer' USING ERRCODE = '22023';
  END IF;
  IF goal_metric = 'race_time' AND NEW.target <= 0 THEN
    RAISE EXCEPTION 'Race milestone target must be positive' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION planning_private.validate_activity_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.unlinked_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM coaching.garmin_activities a WHERE a.activity_id = NEW.activity_id
  ) THEN
    RAISE EXCEPTION 'Activity is unavailable for linking' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION planning_private.validate_week_cycle() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE c_start date; c_end date;
BEGIN
  SELECT start_date, end_date INTO c_start, c_end
  FROM planning_private.plan_cycles WHERE id = NEW.cycle_id;
  IF NOT FOUND OR NEW.week_start > c_end OR NEW.week_start + 6 < c_start THEN
    RAISE EXCEPTION 'Annotated week must overlap its cycle' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION planning_private.validate_session_period() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE c_start date; c_end date; w_start date;
BEGIN
  IF NEW.cycle_id IS NOT NULL THEN
    SELECT start_date, end_date INTO c_start, c_end
    FROM planning_private.plan_cycles WHERE id = NEW.cycle_id;
    IF NOT FOUND OR NEW.session_date < c_start OR NEW.session_date > c_end THEN
      RAISE EXCEPTION 'Session date must fit its cycle' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.week_id IS NOT NULL THEN
    SELECT week_start INTO w_start FROM planning_private.plan_weeks WHERE id = NEW.week_id;
    IF NOT FOUND OR NEW.session_date < w_start OR NEW.session_date > w_start + 6 THEN
      RAISE EXCEPTION 'Session date must fit its annotated week' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION planning_private.bump_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END $$;

CREATE FUNCTION planning_private.reject_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Planning event log is append-only' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER plan_cycles_validate BEFORE INSERT OR UPDATE ON planning_private.plan_cycles
  FOR EACH ROW EXECUTE FUNCTION planning_private.validate_cycle_dates();
CREATE TRIGGER plan_weeks_validate BEFORE INSERT OR UPDATE ON planning_private.plan_weeks
  FOR EACH ROW EXECUTE FUNCTION planning_private.validate_week_cycle();
CREATE TRIGGER planned_sessions_validate BEFORE INSERT OR UPDATE ON planning_private.planned_sessions
  FOR EACH ROW EXECUTE FUNCTION planning_private.validate_session_period();
CREATE TRIGGER training_goals_validate BEFORE INSERT OR UPDATE ON planning_private.training_goals
  FOR EACH ROW EXECUTE FUNCTION planning_private.validate_goal_period();
CREATE TRIGGER goal_milestones_validate BEFORE INSERT OR UPDATE ON planning_private.goal_milestones
  FOR EACH ROW EXECUTE FUNCTION planning_private.validate_milestone();
CREATE TRIGGER session_activity_links_validate BEFORE INSERT OR UPDATE ON planning_private.session_activity_links
  FOR EACH ROW EXECUTE FUNCTION planning_private.validate_activity_link();

CREATE TRIGGER plan_cycles_revision BEFORE UPDATE ON planning_private.plan_cycles
  FOR EACH ROW EXECUTE FUNCTION planning_private.bump_revision();
CREATE TRIGGER plan_weeks_revision BEFORE UPDATE ON planning_private.plan_weeks
  FOR EACH ROW EXECUTE FUNCTION planning_private.bump_revision();
CREATE TRIGGER planned_sessions_revision BEFORE UPDATE ON planning_private.planned_sessions
  FOR EACH ROW EXECUTE FUNCTION planning_private.bump_revision();
CREATE TRIGGER training_goals_revision BEFORE UPDATE ON planning_private.training_goals
  FOR EACH ROW EXECUTE FUNCTION planning_private.bump_revision();
CREATE TRIGGER goal_milestones_revision BEFORE UPDATE ON planning_private.goal_milestones
  FOR EACH ROW EXECUTE FUNCTION planning_private.bump_revision();
CREATE TRIGGER session_activity_links_revision BEFORE UPDATE ON planning_private.session_activity_links
  FOR EACH ROW EXECUTE FUNCTION planning_private.bump_revision();
CREATE TRIGGER plan_events_no_update BEFORE UPDATE OR DELETE ON planning_private.plan_change_events
  FOR EACH ROW EXECUTE FUNCTION planning_private.reject_event_mutation();
CREATE TRIGGER plan_events_no_truncate BEFORE TRUNCATE ON planning_private.plan_change_events
  FOR EACH STATEMENT EXECUTE FUNCTION planning_private.reject_event_mutation();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plan_cycles','plan_weeks','planned_sessions','training_goals',
      'goal_milestones','session_activity_links','plan_change_events'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE planning_private.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE pg_catalog.format('ALTER TABLE planning_private.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA planning_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA planning_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA planning_private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning_private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning_private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA planning_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
