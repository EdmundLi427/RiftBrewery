// Pure types and mappers — safe to import from client components.
// Anything that touches the DB lives in `lib/cards.server.ts`.

import type { Card, CardType } from '@/lib/rules';

/**
 * Shape of a row read from the cards table.
 * Mirrors the actual schema with Rift Codex columns: domain, energy, might, power, etc.
 */
export interface CardRow {
  id: string;
  riftbound_id: string;
  name: string;
  type: CardType;
  supertype: string | null;
  rarity: string | null;
  domain: string[];
  energy: number | null;
  might: number | null;
  power: number | null;
  text_plain: string | null;
  text_flavour: string | null;
  set_id: string;
  set_label: string;
  image_url: string;
  tags: string[];
  champion_key: string | null;
  alternate_art: boolean;
  signature: boolean;
  overnumbered: boolean;
}

/**
 * Convert a DB row into the canonical Card shape the validator consumes.
 * Maps domain → colors for the validator's internal vocabulary.
 */
export function toCard(row: Pick<CardRow, 'id' | 'name' | 'type' | 'domain'>): Card {
  return {
    id: row.id,
    baseName: row.name.replace(/\s*\([^)]*\)$/, '').trim(),
    name: row.name,
    type: row.type,
    colors: row.domain,
  };
}
