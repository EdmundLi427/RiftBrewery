'use server'

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import sql from '@/lib/db';
import { getSessionUserId } from '@/lib/session';
import { DeckCardEntry, validateDeck } from '@/lib/rules';
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
 * Rename an existing deck.
 */
export async function renameDeck(
  _prevState: { message?: string } | null,
  formData: FormData
): Promise<{ message?: string }> {
  const userId = await getSessionUserId();
  const deckId = (formData.get('deckId') as string)?.trim();
  const newName = (formData.get('newName') as string)?.trim() || 'Untitled Deck';

  if (!deckId) {
    return { message: 'Deck ID is required' };
  }

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    return { message: 'Deck not found or access denied' };
  }

  await sql`UPDATE decks SET name = ${newName} WHERE id = ${deckId}`;

  return { message: 'Deck renamed' };
}

/**
 * Delete a deck and all its cards.
 */
export async function deleteDeck(
  _prevState: { message?: string } | null,
  formData: FormData
): Promise<{ message?: string }> {
  const userId = await getSessionUserId();
  const deckId = (formData.get('deckId') as string)?.trim();

  if (!deckId) {
    return { message: 'Deck ID is required' };
  }

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    return { message: 'Deck not found or access denied' };
  }

  // Delete cascade will handle deck_cards
  await sql`DELETE FROM decks WHERE id = ${deckId}`;

  return { message: 'Deck deleted' };
}

/**
 * Set the legend card for a deck.
 */
export async function setLegend(
  _prevState: { message?: string } | null,
  formData: FormData
): Promise<{ message?: string }> {
  const userId = await getSessionUserId();
  const deckId = (formData.get('deckId') as string)?.trim();
  const legendCardId = (formData.get('legendCardId') as string)?.trim();

  if (!deckId || !legendCardId) {
    return { message: 'Missing deck or legend card ID' };
  }

  // Verify ownership and get current deck
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    return { message: 'Deck not found or access denied' };
  }

  // Verify legend card exists and is a legend
  const [legend] = await sql<{ type: string }[]>`
    SELECT type FROM cards WHERE id = ${legendCardId} LIMIT 1
  `;

  if (!legend) {
    return { message: 'Legend card not found' };
  }

  if (legend.type !== 'legend') {
    return { message: 'Selected card is not a legend' };
  }

  await sql`UPDATE decks SET legend_card_id = ${legendCardId} WHERE id = ${deckId}`;

  return { message: 'Legend updated' };
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

/**
 * Save a deck after validation.
 * Expects the full updated deck and optional errors from client-side validation.
 */
export async function saveDeck(
  _prevState: { ok: boolean; errors?: unknown[] } | null,
  formData: FormData
): Promise<{ ok: boolean; errors?: unknown[] }> {
  const userId = await getSessionUserId();
  const deckId = (formData.get('deckId') as string)?.trim();
  const deckDataStr = (formData.get('deckData') as string) || '{}';
  const legendCardId = (formData.get('legendCardId') as string)?.trim();

  let deckData: DeckCardEntry[];
  try {
    deckData = JSON.parse(deckDataStr);
  } catch {
    return { ok: false, errors: [{ kind: 'invalid_json' }] };
  }

  if (!deckId || !legendCardId) {
    return { ok: false, errors: [{ kind: 'missing_required_fields' }] };
  }

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    return { ok: false, errors: [{ kind: 'access_denied' }] };
  }

  // Build card index and validate
  const cardIds = [legendCardId, ...deckData.map((d) => d.cardId)].filter(Boolean);
  const cardRows = await sql<Pick<CardRow, 'id' | 'name' | 'type' | 'domain'>[]>`
    SELECT id, name, type, domain FROM cards WHERE id = ANY(${cardIds})
  `;

  const cardIndex = new Map(cardRows.map((row) => [row.id, toCard(row)]));

  const validation = validateDeck({ legendCardId, championCardId: null, cards: deckData }, cardIndex);

  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  // Save: transaction with delete + insert + update
  await sql.begin(async (tx) => {
    await tx`DELETE FROM deck_cards WHERE deck_id = ${deckId}`;

    if (deckData.length > 0) {
      await tx`
        INSERT INTO deck_cards ${tx(deckData.map(e => ({
          deck_id: deckId,
          card_id: e.cardId,
          section: e.section,
          quantity: e.quantity,
        })))}
      `;
    }

    await tx`UPDATE decks SET legend_card_id = ${legendCardId} WHERE id = ${deckId}`;
  });

  return { ok: true };
}

/**
 * Toggle public sharing on a deck.
 * Sets is_public=true and generates a short share_slug if not already present.
 */
export async function togglePublic(
  _prevState: { message?: string; slug?: string } | null,
  formData: FormData
): Promise<{ message?: string; slug?: string }> {
  const userId = await getSessionUserId();
  const deckId = (formData.get('deckId') as string)?.trim();
  const isPublic = formData.get('isPublic') === 'true';

  if (!deckId) {
    return { message: 'Deck ID is required' };
  }

  // Verify ownership
  const [deck] = await sql<{ user_id: number; share_slug: string | null }[]>`
    SELECT user_id, share_slug FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    return { message: 'Deck not found or access denied' };
  }

  if (isPublic) {
    let slug = deck.share_slug;
    if (!slug) {
      const { randomBytes } = await import('crypto');
      let saved = false;
      for (let i = 0; i < 10 && !saved; i++) {
        const candidate = randomBytes(6).toString('base64url');
        try {
          await sql`UPDATE decks SET is_public = true, share_slug = ${candidate} WHERE id = ${deckId}`;
          slug = candidate;
          saved = true;
        } catch (e: any) {
          if (e.code !== '23505') throw e;
        }
      }
      if (!saved) return { message: 'Failed to generate unique slug' };
    } else {
      await sql`UPDATE decks SET is_public = true WHERE id = ${deckId}`;
    }

    return { message: 'Deck is now public', slug };
  } else {
    await sql`UPDATE decks SET is_public = false WHERE id = ${deckId}`;
    return { message: 'Deck is now private' };
  }
}
