BEGIN;
CREATE TABLE IF NOT EXISTS firstrep_workout_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 plan_id uuid, started_at timestamptz NOT NULL, completed_at timestamptz,
 perceived_effort smallint CHECK(perceived_effort BETWEEN 1 AND 10), notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS firstrep_set_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES firstrep_workout_sessions(id) ON DELETE CASCADE,
 exercise_id text NOT NULL, set_index smallint NOT NULL, reps smallint CHECK(reps >= 0),
 weight numeric(8,2) CHECK(weight >= 0), rpe numeric(3,1), is_warmup boolean NOT NULL DEFAULT false,
 logged_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS firstrep_scheduled_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 scheduled_at timestamptz NOT NULL, session_id uuid REFERENCES firstrep_workout_sessions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS firstrep_analysis_sessions ON firstrep_workout_sessions(user_id,started_at DESC);
CREATE INDEX IF NOT EXISTS firstrep_analysis_sets ON firstrep_set_logs(session_id);
CREATE INDEX IF NOT EXISTS firstrep_analysis_exercise ON firstrep_set_logs(exercise_id,logged_at DESC);
CREATE INDEX IF NOT EXISTS firstrep_analysis_schedule ON firstrep_scheduled_sessions(user_id,scheduled_at);
-- Existing firstrep_bmi_readings already supplies canonical kg body measurements.
COMMIT;
