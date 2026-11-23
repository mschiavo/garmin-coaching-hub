-- Garmin Coaching Hub: fresh-install database bootstrap.
-- Run as project administrator in a NEW Supabase project, before dashboard.sql.
-- Do not run on an existing installation without reviewing differences.
BEGIN;
CREATE SCHEMA IF NOT EXISTS coaching;
REVOKE ALL ON SCHEMA coaching FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS coaching.garmin_activities (
  activity_id bigint PRIMARY KEY,
  activity_date date,
  activity_type text,
  raw_data jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS garmin_activities_date_idx ON coaching.garmin_activities (activity_date DESC);
CREATE TABLE IF NOT EXISTS coaching.garmin_daily_metrics (
  metric_date date PRIMARY KEY,
  sleep_data jsonb,
  hrv_data jsonb,
  body_battery_data jsonb,
  stress_data jsonb,
  daily_summary jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA coaching FROM PUBLIC, anon, authenticated;
COMMIT;
