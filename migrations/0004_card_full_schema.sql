-- Full card schema mirroring the Riftcodex API.
--
-- Drops and recreates `cards` because the placeholder schema in 0002 is too
-- narrow. Also adds a `card_sets` parent table, a `card_indexes` table for
-- filter-dropdown helper data, and rebuilds the FKs that DROP CASCADE removes
-- from `decks` and `deck_cards`.
--
-- Safe to apply on a fresh DB: at this point we have no real card or deck
-- data. Re-running this migration is blocked by the runner (idempotent only
-- in the sense that schema_migrations records the apply).

-- ---------------------------------------------------------------------------
-- card_sets: one row per Riftbound set (OGN, SFD, OPP, ...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_sets (
  id             TEXT        PRIMARY KEY,        -- Riftcodex internal id
  set_id         TEXT        NOT NULL UNIQUE,    -- e.g. "OGN"
  name           TEXT        NOT NULL,           -- "Origins"
  card_count     INTEGER,
  tcgplayer_id   TEXT,
  cardmarket_id  TEXT[],                          -- API may return string or array; we always store an array
  published_on   TIMESTAMPTZ,
  data           JSONB       NOT NULL,           -- full raw payload
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- cards: drop the placeholder table from 0002 and rebuild it with the full
-- API shape, flat-renamed (every API field becomes a top-level column).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS cards CASCADE;

CREATE TABLE cards (
  -- identifiers
  id                  TEXT        PRIMARY KEY,        -- Riftcodex id
  riftbound_id        TEXT        NOT NULL,           -- "ogn-011-298" (not unique: alt-art prints share these)
  tcgplayer_id        TEXT,
  collector_number    INTEGER,
  name                TEXT        NOT NULL,

  -- attributes (flattened from .attributes)
  energy              INTEGER,
  might               INTEGER,
  power               INTEGER,

  -- classification (flattened)
  -- type ∈ {legend, unit, champion_unit, spell, gear, rune, battlefield}
  type                TEXT        NOT NULL,
  supertype           TEXT,
  rarity              TEXT,
  domain              TEXT[]      NOT NULL DEFAULT '{}',  -- lowercased: ['fury','calm']

  -- text
  text_rich           TEXT,
  text_plain          TEXT,
  text_flavour        TEXT,

  -- set link (denormalised label kept for cheap reads)
  set_id              TEXT        NOT NULL REFERENCES card_sets (set_id) ON UPDATE CASCADE,
  set_label           TEXT        NOT NULL,

  -- media
  image_url           TEXT        NOT NULL,
  artist              TEXT,
  accessibility_text  TEXT,

  -- tags / metadata
  tags                TEXT[]      NOT NULL DEFAULT '{}',
  orientation         TEXT,
  clean_name          TEXT,
  updated_on          TIMESTAMPTZ,
  alternate_art       BOOLEAN     NOT NULL DEFAULT FALSE,
  overnumbered        BOOLEAN     NOT NULL DEFAULT FALSE,
  signature           BOOLEAN     NOT NULL DEFAULT FALSE,

  -- champion match key (legends and champion_units share this)
  -- derived: lower(trim(name.split(',')[0])) — see scripts/sync_cards.py
  champion_key        TEXT,

  -- safety net for schema drift
  data                JSONB       NOT NULL,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cards_riftbound_id_idx  ON cards (riftbound_id);
CREATE INDEX cards_name_trgm_idx     ON cards USING GIN (name gin_trgm_ops);
CREATE INDEX cards_domain_gin_idx    ON cards USING GIN (domain);
CREATE INDEX cards_tags_gin_idx      ON cards USING GIN (tags);
CREATE INDEX cards_type_idx          ON cards (type);
CREATE INDEX cards_set_id_idx        ON cards (set_id);
CREATE INDEX cards_champion_key_idx  ON cards (champion_key) WHERE champion_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Rebuild FKs that DROP CASCADE removed.
-- ---------------------------------------------------------------------------

-- decks.legend_card_id: relaxed to NULLable so a new deck can be created
-- before the user picks a legend (per HANDOFF-BUILDER.md).
ALTER TABLE decks ALTER COLUMN legend_card_id DROP NOT NULL;
ALTER TABLE decks
  ADD CONSTRAINT decks_legend_card_id_fkey
  FOREIGN KEY (legend_card_id) REFERENCES cards (id);

-- decks.champion_card_id was added in 0003 and lost its FK in CASCADE.
ALTER TABLE decks
  ADD CONSTRAINT decks_champion_card_id_fkey
  FOREIGN KEY (champion_card_id) REFERENCES cards (id);

-- deck_cards.card_id
ALTER TABLE deck_cards
  ADD CONSTRAINT deck_cards_card_id_fkey
  FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- card_indexes: cached results of the /index/* helper endpoints, used to
-- populate filter dropdowns without scanning `cards`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS card_indexes (
  name       TEXT        PRIMARY KEY,    -- 'keywords' | 'card-names' | 'card-types' | ...
  values     JSONB       NOT NULL,        -- raw array as returned by the API
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
