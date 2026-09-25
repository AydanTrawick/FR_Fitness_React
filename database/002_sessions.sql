CREATE TABLE IF NOT EXISTS firstrep_login_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES firstrep_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS firstrep_session_expiry_idx ON firstrep_login_sessions(expires_at);
