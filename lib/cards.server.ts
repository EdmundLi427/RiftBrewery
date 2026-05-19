// Server-only card queries. Importing this from a client component will
// drag the Postgres driver into the client bundle and break the build.
// Re-export pure helpers from `lib/cards.ts` if a client also needs them.

import 'server-only';
import sql from '@/lib/db';
import type { CardRow } from '@/lib/cards';

/**
 * Get index values for filter dropdowns.
 * Index names: domains, card-types, card-supertypes, rarities, keywords, etc.
 */
export async function getCardIndex(name: string): Promise<string[]> {
  const rows = await sql<{ values: string[] }[]>`
    SELECT values FROM card_indexes WHERE name = ${name}
  `;
  return rows[0]?.values ?? [];
}

/**
 * Fetch the full card pool for the deck builder's browse pane.
 *
 * Returns every card in the catalogue (~1k rows). Sorted by name for stable
 * paging. The builder filters this client-side; we ship the full set once
 * because filter latency matters more than wire size at this scale (~150KB
 * gzipped).
 *
 * Tokens are excluded — they're not legal in any deck section.
 */
export async function getCardPool(): Promise<CardRow[]> {
  return sql<CardRow[]>`
    SELECT id, riftbound_id, name, type, supertype, rarity, domain,
           energy, might, power, text_plain, text_flavour,
           set_id, set_label, image_url, tags, champion_key,
           alternate_art, signature, overnumbered
      FROM cards
     WHERE supertype IS DISTINCT FROM 'Token'
     ORDER BY name, alternate_art, signature, overnumbered
  `;
}
