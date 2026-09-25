BEGIN;

-- Text IDs match upstream's stable values, such as Alternate_Incline_Dumbbell_Curl.
CREATE TABLE IF NOT EXISTS exercises (
  id text PRIMARY KEY,
  name text NOT NULL,
  primary_muscles text[] NOT NULL DEFAULT '{}',
  primary_muscle text,
  secondary_muscles text[] NOT NULL DEFAULT '{}',
  movement_pattern text,
  equipment text,
  is_compound boolean,
  force text,
  level text,
  mechanic text,
  category text,
  instructions text[] NOT NULL DEFAULT '{}',
  images text[] NOT NULL DEFAULT '{}',
  metadata jsonb,
  source text NOT NULL DEFAULT 'free-exercise-db'
);
-- A compatible upstream-shaped exercises table may already exist.
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS primary_muscles text[] NOT NULL DEFAULT '{}';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS primary_muscle text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS movement_pattern text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_compound boolean;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'free-exercise-db';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS metadata jsonb;
CREATE INDEX IF NOT EXISTS exercises_name_idx ON exercises (lower(name));
CREATE INDEX IF NOT EXISTS exercises_primary_muscle_idx ON exercises (lower(primary_muscle));
CREATE INDEX IF NOT EXISTS exercises_equipment_idx ON exercises (lower(equipment));

-- Keep legacy FirstRep IDs so existing favorites and saved workouts remain valid.
INSERT INTO exercises (
  id, name, primary_muscles, primary_muscle, secondary_muscles, movement_pattern,
  equipment, is_compound, level, category, instructions, images, metadata, source
)
SELECT id,
       COALESCE(metadata->>'name', id),
       CASE WHEN metadata->>'primary' IS NOT NULL THEN ARRAY[metadata->>'primary'] ELSE '{}'::text[] END,
       metadata->>'primary',
       COALESCE(ARRAY(SELECT jsonb_array_elements_text(metadata->'secondary')), '{}'),
       NULL,
       metadata->>'equipment',
       NULL,
       COALESCE(lower(metadata->>'difficulty'), 'beginner'),
       'strength',
       COALESCE(ARRAY(SELECT jsonb_array_elements_text(metadata->'instructions')), '{}'),
       COALESCE(ARRAY(SELECT jsonb_array_elements_text(metadata->'images')), '{}'),
       metadata,
       'firstrep'
FROM firstrep_exercises
ON CONFLICT (id) DO UPDATE SET metadata = excluded.metadata
  WHERE exercises.source = 'firstrep';

ALTER TABLE firstrep_favorite_exercises
  DROP CONSTRAINT IF EXISTS firstrep_favorite_exercises_exercise_id_fkey;
ALTER TABLE firstrep_favorite_exercises
  ADD CONSTRAINT firstrep_favorite_exercises_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES exercises(id);

ALTER TABLE firstrep_saved_workout_exercises
  DROP CONSTRAINT IF EXISTS firstrep_saved_workout_exercises_exercise_id_fkey;
ALTER TABLE firstrep_saved_workout_exercises
  ADD CONSTRAINT firstrep_saved_workout_exercises_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES exercises(id);

COMMIT;
