-- FirstRep: run this entire file in the Neon SQL Editor for the database
-- used by NEON_DATABASE_URL. Existing users and log entries are preserved.
-- services/tracking_store.py reads and writes these tables for signed-in users.
BEGIN;

-- Matches services/auth_service.py, including its text UUID user IDs.
CREATE TABLE IF NOT EXISTS public.firstrep_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);
ALTER TABLE public.firstrep_users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';

CREATE TABLE IF NOT EXISTS public.firstrep_bmi_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.firstrep_users(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    height_cm DOUBLE PRECISION NOT NULL CHECK (height_cm BETWEEN 100 AND 250),
    weight_kg DOUBLE PRECISION NOT NULL CHECK (weight_kg BETWEEN 20 AND 500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS firstrep_bmi_user_time_idx
    ON public.firstrep_bmi_readings (user_id, recorded_at, id);

CREATE TABLE IF NOT EXISTS public.firstrep_workout_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.firstrep_users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    exercise TEXT NOT NULL CHECK (length(btrim(exercise)) > 0),
    -- New entries store one row per set. Retain sets for existing CSV logs
    -- and the editable table, which support grouped identical sets.
    sets INTEGER NOT NULL DEFAULT 1 CHECK (sets BETWEEN 1 AND 100),
    reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 1000),
    weight_kg DOUBLE PRECISION NOT NULL CHECK (weight_kg BETWEEN 0 AND 1000),
    rpe NUMERIC NOT NULL CHECK (rpe BETWEEN 1 AND 10 AND mod(rpe, 0.5) = 0),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS firstrep_workout_user_date_idx
    ON public.firstrep_workout_entries (user_id, date, id);
CREATE INDEX IF NOT EXISTS firstrep_workout_user_exercise_date_idx
    ON public.firstrep_workout_entries (user_id, exercise, date);

CREATE TABLE IF NOT EXISTS public.firstrep_food_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES public.firstrep_users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    food TEXT NOT NULL CHECK (length(btrim(food)) > 0),
    protein_g DOUBLE PRECISION NOT NULL CHECK (protein_g BETWEEN 0 AND 10000),
    carbs_g DOUBLE PRECISION NOT NULL CHECK (carbs_g BETWEEN 0 AND 10000),
    fat_g DOUBLE PRECISION NOT NULL CHECK (fat_g BETWEEN 0 AND 10000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS firstrep_food_user_date_idx
    ON public.firstrep_food_entries (user_id, date, id);

-- Store inputs only. The app derives:
-- BMI = weight_kg / power(height_cm / 100.0, 2)
-- workout volume = sets * reps * weight_kg
-- calories = protein_g * 4 + carbs_g * 4 + fat_g * 9
--
-- Ownership foreign keys are not authorization. This app uses server-side
-- psycopg connections and its own login system. Every SELECT, UPDATE and
-- DELETE must filter by the authenticated user's ID; INSERT must obtain
-- user_id from that login session, never from an editable form or CSV.
-- This migration does not configure Neon Auth or row-level security.
COMMIT;
