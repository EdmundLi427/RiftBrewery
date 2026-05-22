import { createHash } from 'crypto';
import type { DeckCardEntry } from '@/lib/rules';

/**
 * Content-hash a deck's card list.
 * Used for Layer-1 gameplan caching — identical decks reuse cached gameplans.
 * Format: sorted card entries as JSON, SHA256 hash.
 */
export function deckHash(
  legendCardId: string | null,
  championCardId: string | null,
  cards: DeckCardEntry[]
): string {
  const content = JSON.stringify({
    legend: legendCardId,
    champion: championCardId,
    cards: cards
      .map((c) => ({ cardId: c.cardId, section: c.section, quantity: c.quantity }))
      .sort((a, b) => a.cardId.localeCompare(b.cardId)),
  });

  return createHash('sha256').update(content).digest('hex');
}

/**
 * Content-hash a deck pair.
 * Used for full-matchup caching — if this hash exists, the entire matchup is cached.
 * Format: lexicographically-sorted deck hashes, SHA256 hash.
 */
export function pairHash(hashA: string, hashB: string): string {
  const sorted = [hashA, hashB].sort();
  const content = JSON.stringify(sorted);
  return createHash('sha256').update(content).digest('hex');
}
