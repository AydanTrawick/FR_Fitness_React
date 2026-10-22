BEGIN;
CREATE TABLE IF NOT EXISTS firstrep_achievement_activity (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 date date NOT NULL, kind text NOT NULL CHECK(kind IN ('run','water','mobility','nutrition','schedule')),
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firstrep_achievement_activity_owner ON firstrep_achievement_activity(user_id,date);
CREATE UNIQUE INDEX IF NOT EXISTS firstrep_achievement_daily_settings ON firstrep_achievement_activity(user_id,date,kind) WHERE kind IN ('nutrition','schedule');
CREATE TABLE IF NOT EXISTS firstrep_achievement_awards (
 user_id text NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 achievement_id text NOT NULL, earned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,achievement_id)
);
CREATE TABLE IF NOT EXISTS firstrep_achievement_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 metric text NOT NULL CHECK(metric='ai_plans_generated'), created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
