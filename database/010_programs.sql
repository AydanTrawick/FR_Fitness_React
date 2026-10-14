BEGIN;
CREATE TABLE IF NOT EXISTS firstrep_program_preferences (
  user_id TEXT NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, bookmarked BOOLEAN NOT NULL DEFAULT FALSE,
  swaps JSONB NOT NULL DEFAULT '{}', PRIMARY KEY(user_id, program_id)
);
CREATE TABLE IF NOT EXISTS firstrep_program_sessions (
  id UUID PRIMARY KEY, user_id TEXT NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
  program_id TEXT NOT NULL, day_index INTEGER NOT NULL CHECK(day_index >= 0),
  week_start DATE NOT NULL, date DATE NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('lb','kg')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
  completion_reason TEXT CHECK(completion_reason IN ('sets','manual')),
  exercises JSONB NOT NULL, UNIQUE(user_id, program_id, day_index, week_start)
);
CREATE TABLE IF NOT EXISTS firstrep_program_sets (
  id UUID PRIMARY KEY, user_id TEXT NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE, session_id UUID NOT NULL REFERENCES firstrep_program_sessions(id) ON DELETE CASCADE,
  exercise_index INTEGER NOT NULL CHECK(exercise_index >= 0), set_index INTEGER NOT NULL CHECK(set_index >= 0),
  weight_kg DOUBLE PRECISION NOT NULL CHECK(weight_kg BETWEEN 0 AND 1000),
  reps INTEGER CHECK(reps BETWEEN 1 AND 1000), duration_seconds INTEGER CHECK(duration_seconds BETWEEN 1 AND 86400),
  distance_m INTEGER CHECK(distance_m BETWEEN 1 AND 100000), rpe NUMERIC NOT NULL CHECK(rpe BETWEEN 1 AND 10),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workout_entry_id UUID REFERENCES firstrep_workout_entries(id) DEFERRABLE INITIALLY DEFERRED,
  CHECK(num_nonnulls(reps, duration_seconds, distance_m) = 1),
  UNIQUE(session_id, exercise_index, set_index)
);
CREATE INDEX IF NOT EXISTS firstrep_program_week ON firstrep_program_sessions(user_id, week_start);
COMMIT;
