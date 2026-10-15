-- REVIEW COPY: not applied to Neon.
-- Extends the existing workout and food logs; no duplicate log tables.
-- Existing numeric values are not changed or backfilled.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('firstrep:011_voice_assistant'));

CREATE TABLE IF NOT EXISTS public.firstrep_schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.pending_log_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.firstrep_users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('workout_set', 'food')),
  source TEXT NOT NULL CHECK (source IN ('text', 'voice')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  confirmed_at TIMESTAMPTZ,
  result_ids UUID[] NOT NULL DEFAULT '{}',
  CHECK (expires_at > created_at),
  CHECK (array_position(result_ids, NULL) IS NULL),
  CHECK (
    (status = 'confirmed' AND confirmed_at IS NOT NULL AND cardinality(result_ids) > 0)
    OR
    (status <> 'confirmed' AND confirmed_at IS NULL AND cardinality(result_ids) = 0)
  )
);
-- Conversation ID scopes "yes" and "same again" to the current chat without
-- storing its message history. Result IDs allow confirmed retries to return
-- the original records. The confirm endpoint must also lock the action row
-- and insert/update within one transaction; the unique key alone is not enough.
CREATE INDEX pending_log_actions_owner_chat_time_idx
  ON public.pending_log_actions(user_id, conversation_id, created_at DESC, id);
CREATE INDEX pending_log_actions_expiry_idx
  ON public.pending_log_actions(expires_at) WHERE status = 'pending';

ALTER TABLE public.firstrep_workout_entries
  ALTER COLUMN rpe DROP NOT NULL,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN weight_as_entered DOUBLE PRECISION,
  ADD COLUMN weight_unit TEXT,
  ADD CONSTRAINT firstrep_workout_source_check
    CHECK (source IN ('legacy', 'manual', 'text', 'voice')),
  ADD CONSTRAINT firstrep_workout_entered_weight_check CHECK (
    (weight_unit IS NULL AND weight_as_entered IS NULL)
    OR
    (weight_unit IS NOT NULL AND (
      (weight_unit = 'bodyweight' AND (weight_as_entered IS NULL OR weight_as_entered = 0))
      OR
      (weight_unit = 'lb' AND weight_as_entered IS NOT NULL
        AND weight_as_entered BETWEEN 0 AND 2204.622622)
      OR
      (weight_unit = 'kg' AND weight_as_entered IS NOT NULL
        AND weight_as_entered BETWEEN 0 AND 1000)
    ))
  ),
  ADD CONSTRAINT firstrep_workout_unit_check
    CHECK (weight_unit IS NULL OR weight_unit IN ('lb', 'kg', 'bodyweight'));
-- weight_kg remains the canonical analysis value, with its existing constraints.
-- Existing rows and unmodified UI writers retain the legacy marker.
-- The assistant supplies text/voice explicitly; updated manual writers will
-- supply manual explicitly. No original unit is guessed for historical rows.

ALTER TABLE public.firstrep_food_entries
  ALTER COLUMN protein_g DROP NOT NULL,
  ALTER COLUMN carbs_g DROP NOT NULL,
  ALTER COLUMN fat_g DROP NOT NULL,
  ADD COLUMN meal TEXT NOT NULL DEFAULT 'unspecified'
    CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack', 'unspecified')),
  ADD COLUMN calories DOUBLE PRECISION CHECK (calories BETWEEN 0 AND 100000),
  ADD COLUMN values_source TEXT NOT NULL DEFAULT 'legacy'
    CHECK (values_source IN ('legacy', 'user_stated', 'assistant_estimate')),
  ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy'
    CHECK (source IN ('legacy', 'manual', 'text', 'voice'));
-- Unspecified nutrients and calories can remain NULL. Do not convert them to
-- zero or derive calories for an assistant request that only states protein.
-- Existing food values stay exactly as recorded, including existing zeros.

INSERT INTO public.firstrep_schema_migrations(name)
VALUES ('database/011_voice_assistant.sql');
COMMIT;
