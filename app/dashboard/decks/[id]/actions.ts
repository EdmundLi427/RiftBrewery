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
