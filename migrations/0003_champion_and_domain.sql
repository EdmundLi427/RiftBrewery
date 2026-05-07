-- Add champion card support and formalize color/domain terminology.

-- Add champion_key column to cards table for matching champions to legends.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS champion_key TEXT;
CREATE INDEX IF NOT EXISTS cards_champion_key_idx ON cards (champion_key) WHERE champion_key IS NOT NULL;

-- Add champion_card_id column to decks table.
ALTER TABLE decks ADD COLUMN IF NOT EXISTS champion_card_id TEXT REFERENCES cards (id);
CREATE INDEX IF NOT EXISTS decks_champion_card_id_idx ON decks (champion_card_id);

-- Relax the deck_cards section CHECK to include 'champion'.
ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_section_check;
ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_section_check
  CHECK (section IN ('champion','main','sideboard','battlefield','rune'));
