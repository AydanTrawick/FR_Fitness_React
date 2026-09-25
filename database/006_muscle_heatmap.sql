BEGIN;

-- Keep the existing grouped workout log. A row's sets count remains the
-- number of identical sets, so the heatmap can count historical entries.
ALTER TABLE firstrep_workout_entries
  ADD COLUMN IF NOT EXISTS exercise_id text REFERENCES exercises(id),
  ADD COLUMN IF NOT EXISTS performed_at timestamptz;

UPDATE firstrep_workout_entries
SET performed_at = date::timestamp AT TIME ZONE 'UTC'
WHERE performed_at IS NULL;

-- Only unambiguous case-insensitive exact names are linked automatically.
WITH exact AS (
  SELECT lower(btrim(name)) AS key, min(id) AS id
  FROM exercises
  GROUP BY lower(btrim(name))
  HAVING count(*) = 1
)
UPDATE firstrep_workout_entries w
SET exercise_id = exact.id
FROM exact
WHERE w.exercise_id IS NULL AND lower(btrim(w.exercise)) = exact.key;

CREATE INDEX IF NOT EXISTS firstrep_workout_user_performed_idx
  ON firstrep_workout_entries(user_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS firstrep_workout_exercise_id_idx
  ON firstrep_workout_entries(exercise_id);

-- Older analysis sessions already have individual sets. Add direct ownership
-- and a canonical timestamp without replacing that table.
ALTER TABLE firstrep_set_logs
  ADD COLUMN IF NOT EXISTS user_id text REFERENCES firstrep_users(id),
  ADD COLUMN IF NOT EXISTS performed_at timestamptz;
UPDATE firstrep_set_logs l
SET user_id = s.user_id,
    performed_at = COALESCE(l.logged_at, s.started_at)
FROM firstrep_workout_sessions s
WHERE l.session_id = s.id AND (l.user_id IS NULL OR l.performed_at IS NULL);
CREATE INDEX IF NOT EXISTS firstrep_set_logs_user_performed_idx
  ON firstrep_set_logs(user_id, performed_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firstrep_set_logs_owner_required') THEN
    ALTER TABLE firstrep_set_logs ADD CONSTRAINT firstrep_set_logs_owner_required
      CHECK (user_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firstrep_set_logs_performed_required') THEN
    ALTER TABLE firstrep_set_logs ADD CONSTRAINT firstrep_set_logs_performed_required
      CHECK (performed_at IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firstrep_set_logs_reps_required') THEN
    ALTER TABLE firstrep_set_logs ADD CONSTRAINT firstrep_set_logs_reps_required
      CHECK (reps IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firstrep_set_logs_weight_required') THEN
    ALTER TABLE firstrep_set_logs ADD CONSTRAINT firstrep_set_logs_weight_required
      CHECK (weight IS NOT NULL) NOT VALID;
  END IF;
END $$;

-- NOT VALID preserves any older unrecognized IDs while enforcing the FK for
-- future inserts and updates. See the review query below before validating.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'firstrep_set_logs_exercise_fk'
  ) THEN
    ALTER TABLE firstrep_set_logs ADD CONSTRAINT firstrep_set_logs_exercise_fk
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) NOT VALID;
  END IF;
END $$;

COMMIT;

-- Review unmatched names. Run scripts/report-unmatched-exercises.mjs for
-- ranked fuzzy suggestions; never assign them without confirmation.
SELECT w.exercise, count(*) AS rows, sum(w.sets) AS sets,
       array_agg(DISTINCT w.user_id) AS user_ids
FROM firstrep_workout_entries w
WHERE w.exercise_id IS NULL
GROUP BY w.exercise ORDER BY rows DESC, w.exercise;

SELECT l.id, l.exercise_id, l.user_id
FROM firstrep_set_logs l LEFT JOIN exercises e ON e.id = l.exercise_id
WHERE e.id IS NULL OR l.user_id IS NULL OR l.performed_at IS NULL
   OR l.reps IS NULL OR l.weight IS NULL;
