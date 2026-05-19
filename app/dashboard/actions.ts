'use server'

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import sql from '@/lib/db';
import { getSessionUserId } from '@/lib/session';
import { DeckCardEntry } from '@/lib/rules';
import { toCard, type CardRow } from '@/lib/cards';

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('token');
  redirect('/login');
}

/**
 * Create a new (blank) deck for the current user.
 *
 * The deck starts with no legend, no champion, and no cards. The user picks
 * everything inside the builder by clicking card images. Schema allows
 * `legend_card_id` to be NULL specifically to support this flow.
 */
export async function createDeck(
  _prevState: { message?: string; deckId?: string } | null,
  formData: FormData
): Promise<{ message?: string; deckId?: string }> {
  const userId = await getSessionUserId();
  const name = (formData.get('name') as string)?.trim() || 'Untitled Deck';

  const [deck] = await sql<{ id: string }[]>`
    INSERT INTO decks (user_id, name)
    VALUES (${userId}, ${name})
    RETURNING id
  `;

  return { deckId: deck.id };
}

/**
 * Load a deck for editing.
 *
 * Returns the deck row plus a validator-shape card index *just* for the
 * cards already referenced by the deck (legend, champion, deck_cards). This
 * is the minimum the validator needs to flag legality.
 *
 * The full card pool for the browse pane comes from `getCardPool()` in
 * `lib/cards.ts` — it's a separate concern with a separate shape (CardRow)
 * and a much larger row count (~1k).
 */
export async function getDeck(deckId: string) {
  const userId = await getSessionUserId();

  const [deck] = await sql<
    {
      id: string;
      name: string;
      legend_card_id: string | null;
      champion_card_id: string | null;
      is_public: boolean;
      share_slug: string | null;
    }[]
  >`
    SELECT id, name, legend_card_id, champion_card_id, is_public, share_slug
    FROM decks
    WHERE id = ${deckId} AND user_id = ${userId}
    LIMIT 1
  `;

  if (!deck) {
    return null;
  }

  const deckCards = await sql<
    {
      card_id: string;
      section: 'main' | 'sideboard' | 'battlefield' | 'rune' | 'champion';
      quantity: number;
    }[]
  >`
    SELECT card_id, section, quantity
    FROM deck_cards
    WHERE deck_id = ${deckId}
  `;

  // Validator index: only the cards this deck actually uses, in Card shape.
  const referencedIds = [
    deck.legend_card_id,
    deck.champion_card_id,
    ...deckCards.map((dc) => dc.card_id),
  ].filter((id): id is string => id !== null);

  const cardRows = referencedIds.length
    ? await sql<Pick<CardRow, 'id' | 'name' | 'type' | 'domain'>[]>`
        SELECT id, name, type, domain FROM cards WHERE id = ANY(${referencedIds})
      `
    : [];

  const cardIndex = new Map(cardRows.map((row) => [row.id, toCard(row)]));

  const deckCardEntries: DeckCardEntry[] = deckCards.map((dc) => ({
    cardId: dc.card_id,
    section: dc.section,
    quantity: dc.quantity,
  }));

  return {
    deck: {
      id: deck.id,
      name: deck.name,
      legendCardId: deck.legend_card_id,
      championCardId: deck.champion_card_id,
      isPublic: deck.is_public,
      shareSlug: deck.share_slug,
      cards: deckCardEntries,
    },
    cardIndex,
  };
}

