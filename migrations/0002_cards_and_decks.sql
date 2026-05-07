-- Extensions we rely on.
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram index for card name search

-- ---------------------------------------------------------------------------
-- cards: canonical Riftbound card catalogue, synced from the Riot Content API.
-- ---------------------------------------------------------------------------
CREATE TABLE cards (
  id         TEXT        PRIMARY KEY,              -- external id from Riot API
  name       TEXT        NOT NULL,
  type       TEXT        NOT NULL,                 -- legend | unit | spell | gear | battlefield | rune (exact set confirmed post-ingest)
  subtypes   TEXT[]      NOT NULL DEFAULT '{}',
  colors     TEXT[]      NOT NULL DEFAULT '{}',
  cost       INTEGER,                              -- nullable: not every card type has a cost
  stats      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  rarity     TEXT,
  set_code   TEXT,
  image_url  TEXT,
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb, -- raw API payload, future-proofs schema drift
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cards_type_idx     ON cards (type);
CREATE INDEX cards_set_code_idx ON cards (set_code);
CREATE INDEX cards_colors_idx   ON cards USING GIN (colors);
CREATE INDEX cards_name_trgm    ON cards USING GIN (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- decks: one row per user-created deck.
-- ---------------------------------------------------------------------------
CREATE TABLE decks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  legend_card_id  TEXT        NOT NULL REFERENCES cards (id),
  is_public       BOOLEAN     NOT NULL DEFAULT FALSE,
  share_slug      TEXT        UNIQUE,              -- short random id, only set when is_public = true
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX decks_user_id_idx        ON decks (user_id);
CREATE INDEX decks_legend_card_id_idx ON decks (legend_card_id);
CREATE INDEX decks_is_public_idx      ON decks (is_public) WHERE is_public;

-- Automatic updated_at bump on row update.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decks_set_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- deck_cards: composite rows linking decks to cards in a given section.
-- ---------------------------------------------------------------------------
CREATE TABLE deck_cards (
  deck_id   UUID    NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  card_id   TEXT    NOT NULL REFERENCES cards (id),
  section   TEXT    NOT NULL
    CHECK (section IN ('main', 'sideboard', 'battlefield', 'rune')),
  quantity  INTEGER NOT NULL CHECK (quantity >= 1),
  PRIMARY KEY (deck_id, card_id, section)
);

CREATE INDEX deck_cards_deck_id_idx ON deck_cards (deck_id);
CREATE INDEX deck_cards_card_id_idx ON deck_cards (card_id);
