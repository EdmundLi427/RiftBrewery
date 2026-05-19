'use server'

import { DeckCardEntry } from '@/lib/rules';
import sql from '@/lib/db';

export interface ImportResult {
  legendCardId: string | null;
  championCardId: string | null;
  cards: DeckCardEntry[];
  errors?: string[];
}

/**
 * Import a deck from human-readable text format.
 *
 * Format:
 *   {qty} {card name}       (one line per entry)
 *   Sideboard:              (section separator — everything after is sideboard)
 *
 * Sections before "Sideboard:" are inferred from card type:
 *   legend       → legendCardId (quantity ignored, always 1)
 *   champion_unit → championCardId (quantity ignored, always 1)
 *   battlefield  → section 'battlefield'
 *   rune         → section 'rune'
 *   everything else → section 'main'
 */
export async function importDeckText(text: string): Promise<ImportResult> {
  const errors: string[] = [];
  const lines = text.trim().split('\n');
  let inSideboard = false;

  // Accepts both "Fiora, Grand Duelist" (comma style) and "Fiora - Grand Duelist" (DB style).
  const normalizeName = (name: string) => name.replace(/,\s+/g, ' - ');

  type ParsedLine = { qty: number; rawName: string; sideboard: boolean; lineNum: number };
  const parsed: ParsedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.toLowerCase() === 'sideboard:') {
      inSideboard = true;
      continue;
    }

    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) {
      errors.push(`Line ${i + 1}: invalid format — expected "N Card Name"`);
      continue;
    }

    const qty = parseInt(m[1], 10);
    if (qty < 1) {
      errors.push(`Line ${i + 1}: quantity must be at least 1`);
      continue;
    }

    parsed.push({ qty, rawName: normalizeName(m[2].trim()), sideboard: inSideboard, lineNum: i + 1 });
  }

  if (parsed.length === 0 && errors.length === 0) {
    return { legendCardId: null, championCardId: null, cards: [], errors: ['Empty decklist'] };
  }

  // Batch-lookup by name — prefer base prints (alternate_art=false, signature=false, overnumbered=false).
  // Use IN ${sql(array)} (individual parameters) instead of = ANY(array) because postgres.js
  // serialises ANY arrays as text array literals where values with commas must be quoted —
  // IN with separate bindings sidesteps that entirely.
  const uniqueNames = [...new Set(parsed.map((p) => p.rawName.toLowerCase()))];
  const rows = await sql<{ id: string; name: string; type: string }[]>`
    SELECT DISTINCT ON (LOWER(name)) id, name, type
    FROM cards
    WHERE LOWER(name) IN ${sql(uniqueNames)}
    ORDER BY LOWER(name), alternate_art, signature, overnumbered, set_id
  `;

  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r]));

  let legendCardId: string | null = null;
  let championCardId: string | null = null;
  const cards: DeckCardEntry[] = [];

  for (const p of parsed) {
    const row = byName.get(p.rawName.toLowerCase());
    if (!row) {
      errors.push(`Line ${p.lineNum}: card not found — "${p.rawName}"`);
      continue;
    }

    if (p.sideboard) {
      cards.push({ cardId: row.id, section: 'sideboard', quantity: p.qty });
      continue;
    }

    // Infer section from card type
    switch (row.type) {
      case 'legend':
        legendCardId = row.id;
        break;
      case 'champion_unit':
        if (!championCardId) {
          championCardId = row.id;
        } else {
          // Second champion_unit goes to main
          cards.push({ cardId: row.id, section: 'main', quantity: p.qty });
        }
        break;
      case 'battlefield':
        cards.push({ cardId: row.id, section: 'battlefield', quantity: p.qty });
        break;
      case 'rune':
        cards.push({ cardId: row.id, section: 'rune', quantity: p.qty });
        break;
      default:
        cards.push({ cardId: row.id, section: 'main', quantity: p.qty });
    }
  }

  return {
    legendCardId,
    championCardId,
    cards,
    errors: errors.length > 0 ? errors : undefined,
  };
}
