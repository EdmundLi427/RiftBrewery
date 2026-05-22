-- Add spell-damage enrichment columns to cards table.
-- These are permanently cached — face-value damage extracted from card text,
-- written once by scripts/extract_spell_damage.py, never updated.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS spell_damage         INTEGER;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS spell_damage_targets TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS spell_damage_synced  BOOLEAN NOT NULL DEFAULT FALSE;

-- Add constraint separately (can't add CHECK with IF NOT EXISTS)
ALTER TABLE cards ADD CONSTRAINT IF NOT EXISTS spell_damage_targets_check
  CHECK (spell_damage_targets IS NULL OR spell_damage_targets IN ('single', 'multi'));
