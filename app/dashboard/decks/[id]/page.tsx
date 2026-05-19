import Link from 'next/link';
import { getSessionUserId } from '@/lib/session';
import { getDeck } from '../../actions';
import { getCardPool } from '@/lib/cards.server';
import DeckBuilderClient from './deck-builder-client';

export default async function DeckBuilderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await getSessionUserId(); // Verify auth

  // Fetch deck-specific data and the full browseable pool in parallel.
  // The pool is the same for every user — Next can cache it transparently.
  const [deckData, cardPool] = await Promise.all([getDeck(id), getCardPool()]);

  if (!deckData) {
    return (
      <div className="w-full">
        <p className="text-red-500 mb-4">Deck not found or access denied.</p>
        <Link href="/dashboard/decks" className="text-blue-500 hover:underline">
          Back to decks
        </Link>
      </div>
    );
  }

  const { deck } = deckData;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div>
          <Link href="/dashboard/decks" className="text-blue-500 hover:underline text-sm mb-2 inline-block">
            ← Back to decks
          </Link>
          <h1 className="text-2xl font-bold">{deck.name}</h1>
        </div>

      </div>

      <DeckBuilderClient
        deckId={deck.id}
        initialLegend={deck.legendCardId}
        initialChampion={deck.championCardId}
        initialCards={deck.cards}
        cardPool={cardPool}
        initialIsPublic={deck.isPublic}
        shareSlug={deck.shareSlug}
      />
    </div>
  );
}
