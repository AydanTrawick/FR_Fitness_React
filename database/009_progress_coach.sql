BEGIN;
CREATE TABLE IF NOT EXISTS user_body_profile (
 user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 height_cm DOUBLE PRECISION NOT NULL CHECK(height_cm BETWEEN 80 AND 250), sex TEXT NOT NULL CHECK(sex IN ('male','female','unspecified')),
 birth_year INTEGER NOT NULL CHECK(birth_year BETWEEN 1900 AND 2200), experience TEXT NOT NULL,
 equipment JSONB NOT NULL, days_per_week INTEGER NOT NULL CHECK(days_per_week BETWEEN 1 AND 7),
 diet_restrictions JSONB NOT NULL DEFAULT '[]', units_pref TEXT NOT NULL CHECK(units_pref IN ('imperial','metric')),
 hide_bodyfat BOOLEAN NOT NULL DEFAULT true, photo_consent_at TIMESTAMPTZ, adult_attested_at TIMESTAMPTZ, nutrition_paused BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS checkins (
 id UUID PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 weight_kg DOUBLE PRECISION NOT NULL CHECK(weight_kg BETWEEN 20 AND 400), energy INTEGER NOT NULL CHECK(energy BETWEEN 1 AND 5),
 soreness INTEGER NOT NULL CHECK(soreness BETWEEN 1 AND 5), adherence INTEGER NOT NULL CHECK(adherence BETWEEN 1 AND 5), notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS checkins_owner_time ON checkins(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS checkin_photos (
 id UUID PRIMARY KEY, checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, pose TEXT NOT NULL CHECK(pose IN ('front','side','back')),
 storage_key TEXT NOT NULL UNIQUE, width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 1600), height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 1600),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(checkin_id,pose)
);
-- Keep durable deletion jobs even if the owning account is removed.
CREATE TABLE IF NOT EXISTS progress_photo_deletions (storage_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE OR REPLACE FUNCTION enqueue_progress_photo_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO progress_photo_deletions(storage_key) VALUES (OLD.storage_key) ON CONFLICT DO NOTHING; RETURN OLD; END; $$;
DROP TRIGGER IF EXISTS progress_photo_delete ON checkin_photos;
CREATE TRIGGER progress_photo_delete BEFORE DELETE ON checkin_photos FOR EACH ROW EXECUTE FUNCTION enqueue_progress_photo_deletion();
CREATE TABLE IF NOT EXISTS photo_analyses (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
 model TEXT NOT NULL, result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS goals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed','archived')),
 type TEXT NOT NULL, focus_areas TEXT[] NOT NULL, target_weight_kg DOUBLE PRECISION, target_date DATE,
 raw_prompt TEXT NOT NULL, structured JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS playbooks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE, version INTEGER NOT NULL CHECK(version>=1), plan JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(goal_id,version)
);
CREATE INDEX IF NOT EXISTS playbooks_owner_time ON playbooks(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS playbook_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK(type IN ('workout','meal_plan','habit','tip','insight')), content JSONB NOT NULL,
 exercise_ids TEXT[] NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS habit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), playbook_item_id UUID NOT NULL REFERENCES playbook_items(id) ON DELETE CASCADE,
 date DATE NOT NULL, done BOOLEAN NOT NULL, UNIQUE(playbook_item_id,date)
);
CREATE TABLE IF NOT EXISTS coach_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), content JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS coach_messages_owner_time ON coach_messages(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS adjustments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
 proposed JSONB NOT NULL, reason TEXT NOT NULL, summary TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- A lease serializes coach turns/confirmations across devices without holding a DB connection during model calls.
CREATE TABLE IF NOT EXISTS progress_coach_leases (user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, token UUID NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
COMMIT;
