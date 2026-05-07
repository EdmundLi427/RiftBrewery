-- Users table. Idempotent because this table may already exist from the
-- Express-era signup flow. On a fresh database this creates it from scratch.

CREATE TABLE IF NOT EXISTS users (
  id         SERIAL      PRIMARY KEY,
  email      TEXT        NOT NULL UNIQUE,
  password   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
