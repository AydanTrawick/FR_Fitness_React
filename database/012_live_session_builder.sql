BEGIN;
-- Existing workout entries remain the authoritative completed-set log.
-- Planned sessions are separate: unfinished targets never become logged sets.
CREATE TABLE IF NOT EXISTS firstrep_live_sessions (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 name text NOT NULL, split text NOT NULL, source text NOT NULL,
 saved_workout_id uuid REFERENCES firstrep_saved_workouts(id) ON DELETE SET NULL,
 default_rest_sec integer NOT NULL, plan jsonb NOT NULL,
 idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz, finished_at timestamptz,
 UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS firstrep_live_sessions_owner ON firstrep_live_sessions(user_id,finished_at DESC);
CREATE TABLE IF NOT EXISTS firstrep_session_exercises (
 session_id uuid NOT NULL REFERENCES firstrep_live_sessions(id) ON DELETE CASCADE,
 position integer NOT NULL, exercise_id text, target_sets integer NOT NULL,
 rep_min integer NOT NULL, rep_max integer NOT NULL, rest_override_sec integer,
 superset_group text, PRIMARY KEY(session_id,position)
);
ALTER TABLE firstrep_saved_workouts ADD COLUMN IF NOT EXISTS session_plan jsonb;
ALTER TABLE firstrep_saved_workouts ADD COLUMN IF NOT EXISTS split text NOT NULL DEFAULT 'custom';
ALTER TABLE firstrep_saved_workouts ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_rep_based boolean;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS muscle_group text;
CREATE INDEX IF NOT EXISTS exercises_muscle_group_idx ON exercises(muscle_group);
CREATE INDEX IF NOT EXISTS exercises_search_idx ON exercises USING gin(to_tsvector('simple',name));
COMMIT;
