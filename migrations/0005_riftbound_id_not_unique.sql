-- The Riftcodex API returns multiple cards sharing a riftbound_id (e.g.
-- alternate-art prints, reprints across promo sets). Our real PK is `id`
-- (the Riftcodex internal id). Drop the UNIQUE constraint and replace it
-- with a plain index so lookups by riftbound_id are still fast.

ALTER TABLE cards DROP CONSTRAINT IF EXISTS cards_riftbound_id_key;
CREATE INDEX IF NOT EXISTS cards_riftbound_id_idx ON cards (riftbound_id);
