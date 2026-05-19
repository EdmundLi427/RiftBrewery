import { getSessionUserId } from '@/lib/session';
import { getDeck } from '../../actions';
import sql from '@/lib/db';

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  await getSessionUserId();

  const deckData = await getDeck(id);
  if (!deckData) {
    return new Response('Deck not found', { status: 404 });
  }

  const { deck } = deckData;

  // Gather all card IDs referenced by the deck
  const allIds = [
    deck.legendCardId,
    deck.championCardId,
    ...deck.cards.map((c) => c.cardId),
  ].filter((id): id is string => id !== null);

  const rows = await sql<{ id: string; name: string; type: string }[]>`
    SELECT id, name, type FROM cards WHERE id = ANY(${allIds})
  `;
  const poolById = new Map(rows.map((r) => [r.id, r]));

  const cardName = (cid: string) => {
    const row = poolById.get(cid);
    return row ? row.name.replace(/\s*\([^)]*\)$/, '').trim() : cid;
  };

  const lines: string[] = [];
  if (deck.legendCardId) lines.push(`1 ${cardName(deck.legendCardId)}`);
  if (deck.championCardId) lines.push(`1 ${cardName(deck.championCardId)}`);

  const bySection: Record<string, typeof deck.cards> = { battlefield: [], rune: [], main: [], sideboard: [] };
  for (const e of deck.cards) bySection[e.section]?.push(e);

  for (const section of ['battlefield', 'rune', 'main'] as const) {
    for (const e of bySection[section]) lines.push(`${e.quantity} ${cardName(e.cardId)}`);
  }
  if (bySection.sideboard.length > 0) {
    lines.push('Sideboard:');
    for (const e of bySection.sideboard) lines.push(`${e.quantity} ${cardName(e.cardId)}`);
  }

  const text = lines.join('\n');

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${deck.name.replace(/\s+/g, '_')}.txt"`,
    },
  });
}
