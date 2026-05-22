-- Matchups table for deck comparison results.
-- Designed to support the full v1.0 shape from day one — AI columns exist but
-- are nullable. Snapshots of computed stats ensure stability across deck edits.

CREATE TABLE IF NOT EXISTS matchups (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_a_id       UUID         NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  deck_b_id       UUID         NOT NULL REFERENCES decks(id) ON DELETE CASCADE,

  -- Content-hash cache keys.
  -- deck_*_hash identifies each deck's card list (Layer-1 gameplan cache).
  -- pair_hash is the full-matchup cache key (if this hash exists, return cached result).
  deck_a_hash     TEXT         NOT NULL,
  deck_b_hash     TEXT         NOT NULL,
  pair_hash       TEXT         NOT NULL,

  -- Snapshot of computed stats (present from creation).
  stats           JSONB        NOT NULL,

  -- AI output. All populated by v1.0 AI layer.
  gameplan_a      JSONB,       -- {archetype, board_shape, summary, win_conditions[], key_cards[], weaknesses[]}
  gameplan_b      JSONB,
  interaction     JSONB,       -- {summary, deck_a_advantages[], deck_b_advantages[]}
  verdict         JSONB,       -- {score_a: 0..100, reasoning}

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CHECK (deck_a_id <> deck_b_id)
);

CREATE INDEX IF NOT EXISTS matchups_user_id_idx   ON matchups(user_id);
CREATE INDEX IF NOT EXISTS matchups_pair_hash_idx ON matchups(pair_hash);

-- Automatic updated_at bump on row update (reuse trigger from decks).
CREATE TRIGGER IF NOT EXISTS matchups_set_updated_at
  BEFORE UPDATE ON matchups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
