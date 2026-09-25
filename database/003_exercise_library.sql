BEGIN;
CREATE TABLE IF NOT EXISTS firstrep_exercises (
 id TEXT PRIMARY KEY, metadata JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS firstrep_favorite_exercises (
 user_id TEXT NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 exercise_id TEXT NOT NULL REFERENCES firstrep_exercises(id),
 PRIMARY KEY(user_id,exercise_id)
);
CREATE TABLE IF NOT EXISTS firstrep_saved_workouts (
 id UUID PRIMARY KEY, user_id TEXT NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
 name TEXT NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120), description TEXT NOT NULL DEFAULT '',
 favorite BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firstrep_saved_workouts_owner ON firstrep_saved_workouts(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS firstrep_saved_workout_exercises (
 workout_id UUID NOT NULL REFERENCES firstrep_saved_workouts(id) ON DELETE CASCADE,
 position INTEGER NOT NULL CHECK(position>=0), exercise_id TEXT NOT NULL REFERENCES firstrep_exercises(id),
 sets INTEGER NOT NULL CHECK(sets BETWEEN 1 AND 100), mode TEXT NOT NULL CHECK(mode IN ('reps','duration')),
 reps TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration BETWEEN 1 AND 86400),
 weight DOUBLE PRECISION CHECK(weight BETWEEN 0 AND 1000), rest INTEGER NOT NULL CHECK(rest BETWEEN 0 AND 3600), notes TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(workout_id,position)
);
COMMIT;
