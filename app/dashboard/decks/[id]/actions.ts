'use server'

import { revalidatePath } from 'next/cache';
import sql from '@/lib/db';
import { getSessionUserId } from '@/lib/session';

/**
 * Set the legend card for a deck.
 * Writes immediately, revalidates the page.
 */
export async function setLegend(deckId: string, cardId: string | null) {
  const userId = await getSessionUserId();

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  await sql`UPDATE decks SET legend_card_id = ${cardId} WHERE id = ${deckId}`;
  revalidatePath(`/dashboard/decks/${deckId}`);
}

/**
 * Set the champion card for a deck.
 * Writes immediately, revalidates the page.
 */
export async function setChampion(deckId: string, cardId: string | null) {
  const userId = await getSessionUserId();

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  await sql`UPDATE decks SET champion_card_id = ${cardId} WHERE id = ${deckId}`;
  revalidatePath(`/dashboard/decks/${deckId}`);
}

/**
 * Add a card to a deck section (or increment quantity).
 * Uses ON CONFLICT to upsert.
 */
export async function addCard(deckId: string, cardId: string, section: 'main' | 'sideboard' | 'battlefield' | 'rune' | 'champion') {
  const userId = await getSessionUserId();

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  // Upsert: insert or increment quantity
  await sql`
    INSERT INTO deck_cards (deck_id, card_id, section, quantity)
    VALUES (${deckId}, ${cardId}, ${section}, 1)
    ON CONFLICT (deck_id, card_id, section)
    DO UPDATE SET quantity = deck_cards.quantity + 1
  `;

  revalidatePath(`/dashboard/decks/${deckId}`);
}

/**
 * Remove a card from a deck section (or decrement quantity).
 * Deletes the row if quantity hits 0.
 */
export async function removeCard(deckId: string, cardId: string, section: 'main' | 'sideboard' | 'battlefield' | 'rune' | 'champion') {
  const userId = await getSessionUserId();

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  // Get current quantity
  const [entry] = await sql<{ quantity: number }[]>`
    SELECT quantity FROM deck_cards
    WHERE deck_id = ${deckId} AND card_id = ${cardId} AND section = ${section}
    LIMIT 1
  `;

  if (!entry) {
    return; // Card not in deck, nothing to remove
  }

  if (entry.quantity > 1) {
    // Decrement
    await sql`
      UPDATE deck_cards
      SET quantity = quantity - 1
      WHERE deck_id = ${deckId} AND card_id = ${cardId} AND section = ${section}
    `;
  } else {
    // Delete
    await sql`
      DELETE FROM deck_cards
      WHERE deck_id = ${deckId} AND card_id = ${cardId} AND section = ${section}
    `;
  }

  revalidatePath(`/dashboard/decks/${deckId}`);
}

/**
 * Swap one card printing for another in a deck section, preserving quantity.
 * Used by the art-switcher in the deck builder.
 */
export async function swapCardArt(
  deckId: string,
  oldCardId: string,
  newCardId: string,
  section: 'main' | 'sideboard' | 'battlefield' | 'rune' | 'champion'
) {
  const userId = await getSessionUserId();

  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  const [entry] = await sql<{ quantity: number }[]>`
    SELECT quantity FROM deck_cards
    WHERE deck_id = ${deckId} AND card_id = ${oldCardId} AND section = ${section}
    LIMIT 1
  `;

  if (!entry) return;

  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM deck_cards
      WHERE deck_id = ${deckId} AND card_id = ${oldCardId} AND section = ${section}
    `;
    await tx`
      INSERT INTO deck_cards (deck_id, card_id, section, quantity)
      VALUES (${deckId}, ${newCardId}, ${section}, ${entry.quantity})
      ON CONFLICT (deck_id, card_id, section)
      DO UPDATE SET quantity = deck_cards.quantity + ${entry.quantity}
    `;
  });

  revalidatePath(`/dashboard/decks/${deckId}`);
}

/**
 * Rename a deck.
 */
export async function renameDeck(deckId: string, name: string) {
  const userId = await getSessionUserId();

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  await sql`UPDATE decks SET name = ${name} WHERE id = ${deckId}`;
  revalidatePath(`/dashboard/decks/${deckId}`);
}

/**
 * Delete a deck.
 */
export async function deleteDeck(deckId: string) {
  const userId = await getSessionUserId();

  // Verify ownership
  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  await sql`DELETE FROM decks WHERE id = ${deckId}`;
  // Redirect happens in the page that calls this
}

/**
 * Bulk-replace the entire deck contents (used after import).
 * Runs in a transaction: clears existing cards then inserts the new set.
 */
export async function replaceDeck(
  deckId: string,
  legendCardId: string | null,
  championCardId: string | null,
  cards: Array<{ cardId: string; section: 'main' | 'sideboard' | 'battlefield' | 'rune' | 'champion'; quantity: number }>
) {
  const userId = await getSessionUserId();

  const [deck] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckId} LIMIT 1
  `;

  if (!deck || deck.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE decks SET legend_card_id = ${legendCardId}, champion_card_id = ${championCardId} WHERE id = ${deckId}`;
    await tx`DELETE FROM deck_cards WHERE deck_id = ${deckId}`;
    if (cards.length > 0) {
      await tx`
        INSERT INTO deck_cards ${tx(cards.map(e => ({
          deck_id: deckId,
          card_id: e.cardId,
          section: e.section,
          quantity: e.quantity,
        })))}
      `;
    }
  });

  revalidatePath(`/dashboard/decks/${deckId}`);
}
