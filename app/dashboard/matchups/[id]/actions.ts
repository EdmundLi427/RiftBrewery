'use server'

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import sql from '@/lib/db';
import { getSessionUserId } from '@/lib/session';
import { getDeck } from '../../actions';
import { validateDeck } from '@/lib/rules';
import { computeMatchupStats } from '@/lib/matchup/stats';
import { deckHash, pairHash } from '@/lib/matchup/hash';
import { runGameplan, runInteraction, runVerdict } from '@/lib/matchup/ai';
import type { CardRow } from '@/lib/cards';

export async function createMatchup(deckAId: string, deckBId: string) {
  const userId = await getSessionUserId();

  // Fetch both decks
  const deckAData = await getDeck(deckAId);
  const deckBData = await getDeck(deckBId);

  if (!deckAData || !deckBData) {
    throw new Error('Deck not found');
  }

  // Verify ownership
  const [deckARow] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckAId} LIMIT 1
  `;
  const [deckBRow] = await sql<{ user_id: number }[]>`
    SELECT user_id FROM decks WHERE id = ${deckBId} LIMIT 1
  `;

  if (!deckARow || deckARow.user_id !== userId || !deckBRow || deckBRow.user_id !== userId) {
    throw new Error('Deck not found or access denied');
  }

  // Hard legal gate
  const validationA = validateDeck(deckAData.deck, deckAData.cardIndex);
  const validationB = validateDeck(deckBData.deck, deckBData.cardIndex);

  if (!validationA.ok || !validationB.ok) {
    throw new Error('Both decks must be legal to compare');
  }

  // Compute hashes
  const hashA = deckHash(deckAData.deck.legendCardId, deckAData.deck.championCardId, deckAData.deck.cards);
  const hashB = deckHash(deckBData.deck.legendCardId, deckBData.deck.championCardId, deckBData.deck.cards);
  const pHash = pairHash(hashA, hashB);

  // Check if this exact matchup already exists
  const [existingMatchup] = await sql<{ id: string }[]>`
    SELECT id FROM matchups WHERE pair_hash = ${pHash} AND user_id = ${userId} LIMIT 1
  `;

  if (existingMatchup) {
    // Return cached result
    redirect(`/dashboard/matchups/${existingMatchup.id}`);
  }

  // Fetch full card data for stats computation
  const allCardIds = [
    deckAData.deck.legendCardId,
    deckAData.deck.championCardId,
    ...deckAData.deck.cards.map((c) => c.cardId),
    deckBData.deck.legendCardId,
    deckBData.deck.championCardId,
    ...deckBData.deck.cards.map((c) => c.cardId),
  ].filter((id): id is string => id !== null);

  const uniqueIds = [...new Set(allCardIds)];
  const cardRows = await sql<CardRow[]>`
    SELECT id, name, type, energy, might, domain, tags, text_plain,
           spell_damage, spell_damage_targets
    FROM cards WHERE id = ANY(${uniqueIds})
  `;

  const cardPool = new Map(cardRows.map((r) => [r.id, r]));

  // Compute stats
  const stats = computeMatchupStats(
    {
      legendCardId: deckAData.deck.legendCardId,
      championCardId: deckAData.deck.championCardId,
      cards: deckAData.deck.cards,
      cardPool,
      deckName: deckAData.deck.name,
    },
    {
      legendCardId: deckBData.deck.legendCardId,
      championCardId: deckBData.deck.championCardId,
      cards: deckBData.deck.cards,
      cardPool,
      deckName: deckBData.deck.name,
    }
  );

  // Insert matchup row
  const [matchup] = await sql<{ id: string }[]>`
    INSERT INTO matchups (user_id, deck_a_id, deck_b_id, deck_a_hash, deck_b_hash, pair_hash, stats)
    VALUES (${userId}, ${deckAId}, ${deckBId}, ${hashA}, ${hashB}, ${pHash}, ${JSON.stringify(stats)})
    RETURNING id
  `;

  revalidatePath('/dashboard/matchups');

  redirect(`/dashboard/matchups/${matchup.id}`);
}

export async function populateGameplans(matchupId: string) {
  const userId = await getSessionUserId();

  const [matchup] = await sql<any[]>`
    SELECT * FROM matchups WHERE id = ${matchupId} AND user_id = ${userId} LIMIT 1
  `;

  if (!matchup) {
    throw new Error('Matchup not found');
  }

  // Fetch both decks
  const deckAData = await getDeck(matchup.deck_a_id);
  const deckBData = await getDeck(matchup.deck_b_id);

  if (!deckAData || !deckBData) {
    throw new Error('Deck not found');
  }

  const stats = matchup.stats;

  // Fetch full card data
  const allCardIds = [
    deckAData.deck.legendCardId,
    deckAData.deck.championCardId,
    ...deckAData.deck.cards.map((c) => c.cardId),
    deckBData.deck.legendCardId,
    deckBData.deck.championCardId,
    ...deckBData.deck.cards.map((c) => c.cardId),
  ].filter((id): id is string => id !== null);

  const uniqueIds = [...new Set(allCardIds)];
  const cardRows = await sql<CardRow[]>`
    SELECT id, name, type, energy, might, domain, tags, text_plain,
           spell_damage, spell_damage_targets
    FROM cards WHERE id = ANY(${uniqueIds})
  `;

  const cardPool = new Map(cardRows.map((r) => [r.id, r]));

  // Prepare card lists for AI
  const cardListA = [
    deckAData.deck.legendCardId ? { id: deckAData.deck.legendCardId, quantity: 1 } : null,
    deckAData.deck.championCardId ? { id: deckAData.deck.championCardId, quantity: 1 } : null,
    ...deckAData.deck.cards.filter((c) => c.section === 'main'),
  ].filter(Boolean);

  const cardListB = [
    deckBData.deck.legendCardId ? { id: deckBData.deck.legendCardId, quantity: 1 } : null,
    deckBData.deck.championCardId ? { id: deckBData.deck.championCardId, quantity: 1 } : null,
    ...deckBData.deck.cards.filter((c) => c.section === 'main'),
  ].filter(Boolean);

  const formatCardListForAI = (cardList: any[]) =>
    cardList.filter((c) => c && c.id).map((c) => {
      const card = cardPool.get(c.id);
      if (!card) return null;
      return {
        quantity: c.quantity as number,
        name: card.name || 'Unknown',
        type: card.type || 'unknown',
        energy: card.energy ?? null,
        might: card.might ?? null,
        text: card.text_plain ?? undefined,
      };
    }).filter((c): c is any => c !== null);

  // Run gameplans
  const gameplanA = await runGameplan(formatCardListForAI(cardListA as any), stats.deckA);
  const gameplanB = await runGameplan(formatCardListForAI(cardListB as any), stats.deckB);

  // Update row
  await sql`
    UPDATE matchups
    SET gameplan_a = ${JSON.stringify(gameplanA)},
        gameplan_b = ${JSON.stringify(gameplanB)}
    WHERE id = ${matchupId}
  `;

  revalidatePath(`/dashboard/matchups/${matchupId}`);
}

export async function populateInteraction(matchupId: string) {
  const userId = await getSessionUserId();

  const [matchup] = await sql<any[]>`
    SELECT * FROM matchups WHERE id = ${matchupId} AND user_id = ${userId} LIMIT 1
  `;

  if (!matchup || !matchup.gameplan_a || !matchup.gameplan_b) {
    throw new Error('Gameplans not yet computed');
  }

  const stats = matchup.stats;
  const gameplanA = matchup.gameplan_a;
  const gameplanB = matchup.gameplan_b;

  const interaction = await runInteraction(gameplanA, gameplanB, stats.deckA, stats.deckB, stats.comparison);

  await sql`
    UPDATE matchups
    SET interaction = ${JSON.stringify(interaction)}
    WHERE id = ${matchupId}
  `;

  revalidatePath(`/dashboard/matchups/${matchupId}`);
}

export async function populateVerdict(matchupId: string) {
  const userId = await getSessionUserId();

  const [matchup] = await sql<any[]>`
    SELECT * FROM matchups WHERE id = ${matchupId} AND user_id = ${userId} LIMIT 1
  `;

  if (!matchup || !matchup.gameplan_a || !matchup.gameplan_b || !matchup.interaction) {
    throw new Error('Prior analysis not yet computed');
  }

  const gameplanA = matchup.gameplan_a;
  const gameplanB = matchup.gameplan_b;
  const interaction = matchup.interaction;

  const verdict = await runVerdict(gameplanA, gameplanB, interaction);

  await sql`
    UPDATE matchups
    SET verdict = ${JSON.stringify(verdict)}
    WHERE id = ${matchupId}
  `;

  revalidatePath(`/dashboard/matchups/${matchupId}`);
}
