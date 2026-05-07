'use server'

import { DeckCardEntry, Deck } from '@/lib/rules';
import sql from '@/lib/db';

/**
 * Export deck to text format.
 * Format: legend line + champion line (optional) + one line per card: "quantity cardId [section]"
 */
export function exportDeckText(deck: Deck): string {
  const lines: string[] = [];

  // Legend line
  if (deck.legendCardId) {
    lines.push(`legend: ${deck.legendCardId}`);
  }

  // Champion line
  if (deck.championCardId) {
    lines.push(`champion: ${deck.championCardId}`);
  }

  // Card lines: quantity cardId section
  for (const entry of deck.cards) {
    lines.push(`${entry.quantity} ${entry.cardId} ${entry.section}`);
  }

  return lines.join('\n');
}

/**
 * Import deck from text format.
 * Parses the format, looks up card IDs, returns entries or error.
 */
export async function importDeckText(text: string): Promise<{
  legendCardId: string | null;
  championCardId: string | null;
  cards: DeckCardEntry[];
  errors?: string[];
}> {
  const errors: string[] = [];
  const lines = text.trim().split('\n').filter((l) => l.trim());

  let legendCardId: string | null = null;
  let championCardId: string | null = null;
  const entries: DeckCardEntry[] = [];
  const cardIds: Set<string> = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for legend line
    if (line.startsWith('legend:')) {
      legendCardId = line.slice('legend:'.length).trim();
      cardIds.add(legendCardId);
      continue;
    }

    // Check for champion line
    if (line.startsWith('champion:')) {
      championCardId = line.slice('champion:'.length).trim();
      cardIds.add(championCardId);
      continue;
    }

    // Parse card line: "quantity cardId [section]"
    const parts = line.split(/\s+/);
    if (parts.length < 2) {
      errors.push(`Line ${i + 1}: invalid format (expected "quantity cardId [section]")`);
      continue;
    }

    const quantity = parseInt(parts[0], 10);
    const cardId = parts[1];
    const section = (parts[2] || 'main') as 'main' | 'sideboard' | 'battlefield' | 'rune' | 'champion';

    if (isNaN(quantity) || quantity < 1) {
      errors.push(`Line ${i + 1}: invalid quantity`);
      continue;
    }

    if (!['main', 'sideboard', 'battlefield', 'rune', 'champion'].includes(section)) {
      errors.push(`Line ${i + 1}: invalid section "${section}"`);
      continue;
    }

    entries.push({ cardId, section, quantity });
    cardIds.add(cardId);
  }

  // Verify all card IDs exist
  if (cardIds.size > 0) {
    const found = await sql<{ id: string }[]>`
      SELECT id FROM cards WHERE id = ANY(${Array.from(cardIds)})
    `;
    const foundIds = new Set(found.map((c) => c.id));

    for (const id of cardIds) {
      if (!foundIds.has(id)) {
        errors.push(`Unknown card ID: ${id}`);
      }
    }
  }

  return { legendCardId, championCardId, cards: entries, errors: errors.length > 0 ? errors : undefined };
}
