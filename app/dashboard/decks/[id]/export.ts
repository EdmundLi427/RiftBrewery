import { getSessionUserId } from '@/lib/session';
import { getDeck } from '../../actions';
import { exportDeckText } from './import-export';

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
  const text = exportDeckText({
    legendCardId: deck.legendCardId,
    championCardId: deck.championCardId,
    cards: deck.cards,
  });

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${deck.name.replace(/\s+/g, '_')}.txt"`,
    },
  });
}
