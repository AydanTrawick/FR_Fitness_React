BEGIN;
-- Preserve the IDs used by all existing FirstRep health records. Old PBKDF2
-- passwords are not copied into Better Auth: existing users use email recovery.
INSERT INTO "user"(id,name,email,email_verified,created_at,updated_at,weight_unit,distance_unit,timezone,goal,onboarded)
SELECT id,display_name,lower(email),false,created_at,NOW(),'kg','km','America/New_York','consistency',false FROM firstrep_users
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='firstrep_user_auth_owner') THEN
  ALTER TABLE firstrep_users ADD CONSTRAINT firstrep_user_auth_owner FOREIGN KEY(id) REFERENCES "user"(id) ON DELETE CASCADE;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS firstrep_user_settings(
 user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 preferences JSONB NOT NULL DEFAULT '{"visibility":"private","aiDataOptIn":false,"analyticsOptIn":false,"workoutEmail":false,"planEmail":false,"newsEmail":false,"workoutPush":false,"planPush":false,"newsPush":false}',
 passkey_prompted BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO firstrep_user_settings(user_id) SELECT id FROM "user" ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS firstrep_audit_log(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 event TEXT NOT NULL,ip TEXT NOT NULL DEFAULT '',user_agent TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS firstrep_audit_owner_time ON firstrep_audit_log(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS firstrep_reserved_username(
 username TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,release_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS firstrep_data_export(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed')),
 file_bytes BYTEA,file_url TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS firstrep_export_queue ON firstrep_data_export(status,created_at);
CREATE TABLE IF NOT EXISTS firstrep_auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS firstrep_auth_failures(email TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0,blocked_until TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS firstrep_recovery_request(
 user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),eligible_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours',cancelled_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS firstrep_email_history(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 old_email TEXT NOT NULL,new_email TEXT NOT NULL,changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),undone_at TIMESTAMPTZ
);
-- All legacy sessions are retired. Better Auth is the only session authority.
DELETE FROM firstrep_login_sessions;
COMMIT;
