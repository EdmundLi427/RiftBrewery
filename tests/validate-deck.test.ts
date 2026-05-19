import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateDeck,
  type Card,
  type Deck,
  type DeckCardEntry,
  type DeckError,
} from '../lib/rules.ts';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const LEGEND_COLORS = ['body', 'calm'];

function card(partial: Partial<Card> & Pick<Card, 'id' | 'type'>): Card {
  return {
    name: partial.id,
    baseName: partial.id,
    colors: [],
    ...partial,
  };
}

// A deliberately small named catalogue. Unit/spell/gear cards have the legend's
// colours so they're legal in main + sideboard by default.
const CARDS: Card[] = [
  card({ id: 'LEG-1', type: 'legend', colors: LEGEND_COLORS }),
  card({ id: 'LEG-MONO', type: 'legend', colors: ['body'] }),
  card({ id: 'LEG-TRI', type: 'legend', colors: ['body', 'calm', 'mind'] }),
  card({ id: 'NOT-A-LEGEND', type: 'unit', colors: LEGEND_COLORS }),

  card({ id: 'UNIT-A', type: 'unit', colors: LEGEND_COLORS }),
  card({ id: 'UNIT-B', type: 'unit', colors: LEGEND_COLORS }),
  card({ id: 'UNIT-C', type: 'unit', colors: LEGEND_COLORS }),
  card({ id: 'SPELL-A', type: 'spell', colors: LEGEND_COLORS }),
  card({ id: 'SPELL-B', type: 'spell', colors: LEGEND_COLORS }),
  card({ id: 'GEAR-A', type: 'gear', colors: LEGEND_COLORS }),

  card({ id: 'OFF-COLOR-UNIT', type: 'unit', colors: ['chaos'] }),
  card({ id: 'OFF-COLOR-RUNE', type: 'rune', colors: ['chaos'] }),

  card({ id: 'RUNE-BODY', type: 'rune', colors: ['body'] }),
  card({ id: 'RUNE-CALM', type: 'rune', colors: ['calm'] }),

  card({ id: 'BF-1', type: 'battlefield', colors: [] }),
  card({ id: 'BF-2', type: 'battlefield', colors: [] }),
  card({ id: 'BF-3', type: 'battlefield', colors: [] }),
  card({ id: 'BF-OFFCOLOR', type: 'battlefield', colors: ['chaos'] }),
];
const CARD_INDEX = new Map(CARDS.map((c) => [c.id, c]));

/**
 * Build a fully-legal deck. Each test can then mutate it to poke at a single
 * rule. 40 main = 3x UNIT-A + 3x UNIT-B + 3x UNIT-C + 3x SPELL-A + 3x SPELL-B
 * + 3x GEAR-A + 22 filler (we reuse SPELL-B as filler via a second entry? no —
 * deck_cards is keyed by (deck_id, card_id, section) so we can't have two rows
 * for the same (card, section). Use distinct cards instead.)
 */
function makeUnitCards(n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    out.push(card({ id: `FILLER-${i}`, type: 'unit', colors: LEGEND_COLORS }));
  }
  return out;
}
const FILLER = makeUnitCards(39);
const FULL_INDEX = new Map([...CARD_INDEX, ...FILLER.map((c): [string, Card] => [c.id, c])]);

function fillerEntries(count: number, section: DeckCardEntry['section']): DeckCardEntry[] {
  const out: DeckCardEntry[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ cardId: `FILLER-${i}`, section, quantity: 1 });
  }
  return out;
}

function validDeck(): Deck {
  return {
    legendCardId: 'LEG-1',
    championCardId: null,
    cards: [
      // Main: 39 distinct filler units (1 of each). Chosen champion lives
      // in its own section; main is the other 39 cards of the 40-card deck.
      ...fillerEntries(39, 'main'),
      // Sideboard: 8 distinct filler units (different indices).
      { cardId: 'UNIT-A', section: 'sideboard', quantity: 1 },
      { cardId: 'UNIT-B', section: 'sideboard', quantity: 1 },
      { cardId: 'UNIT-C', section: 'sideboard', quantity: 1 },
      { cardId: 'SPELL-A', section: 'sideboard', quantity: 1 },
      { cardId: 'SPELL-B', section: 'sideboard', quantity: 1 },
      { cardId: 'GEAR-A', section: 'sideboard', quantity: 3 },
      // Runes: 6 body + 6 calm = 12.
      { cardId: 'RUNE-BODY', section: 'rune', quantity: 6 },
      { cardId: 'RUNE-CALM', section: 'rune', quantity: 6 },
      // Battlefields: 3 unique.
      { cardId: 'BF-1', section: 'battlefield', quantity: 1 },
      { cardId: 'BF-2', section: 'battlefield', quantity: 1 },
      { cardId: 'BF-3', section: 'battlefield', quantity: 1 },
    ],
  };
}

function errorKinds(errors: DeckError[]): string[] {
  return errors.map((e) => e.kind);
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('validateDeck — happy path', () => {
  it('accepts a fully legal deck', () => {
    const result = validateDeck(validDeck(), FULL_INDEX);
    assert.equal(result.ok, true, `expected ok, got errors: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(result.errors, []);
  });

  it('accepts a card index given as a plain object', () => {
    const obj: Record<string, Card> = {};
    for (const [k, v] of FULL_INDEX) obj[k] = v;
    const result = validateDeck(validDeck(), obj);
    assert.equal(result.ok, true);
  });
});

describe('validateDeck — legend', () => {
  it('flags missing_legend when legendCardId is null', () => {
    const deck = validDeck();
    deck.legendCardId = null;
    const { errors } = validateDeck(deck, FULL_INDEX);
    assert.ok(errorKinds(errors).includes('missing_legend'));
  });

  it('flags unknown_card when legend is not in the index', () => {
    const deck = validDeck();
    deck.legendCardId = 'NOPE';
    const { errors } = validateDeck(deck, FULL_INDEX);
    const unknown = errors.find((e) => e.kind === 'unknown_card');
    assert.ok(unknown);
    assert.equal(unknown.cardId, 'NOPE');
  });

  it('flags legend_not_a_legend_card when card.type is not legend', () => {
    const deck = validDeck();
    deck.legendCardId = 'NOT-A-LEGEND';
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find((e) => e.kind === 'legend_not_a_legend_card');
    assert.ok(err);
    assert.equal(err.cardId, 'NOT-A-LEGEND');
    assert.equal(err.cardType, 'unit');
  });

  it('flags legend_color_count when legend has 1 color', () => {
    const deck = validDeck();
    deck.legendCardId = 'LEG-MONO';
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find((e) => e.kind === 'legend_color_count');
    assert.ok(err);
    assert.deepEqual(err.colors, ['body']);
  });

  it('flags legend_color_count when legend has 3 colors', () => {
    const deck = validDeck();
    deck.legendCardId = 'LEG-TRI';
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find((e) => e.kind === 'legend_color_count');
    assert.ok(err);
    assert.equal(err.colors.length, 3);
  });
});

describe('validateDeck — section counts', () => {
  const cases: Array<[string, (d: Deck) => void, { section: string; have: number; need: number }]> = [
    [
      'main too small (38)',
      (d) => {
        d.cards = d.cards.filter((c) => c.cardId !== 'FILLER-0');
      },
      { section: 'main', have: 38, need: 39 },
    ],
    [
      'main too large (40)',
      (d) => {
        d.cards.push({ cardId: 'UNIT-A', section: 'main', quantity: 1 });
      },
      { section: 'main', have: 40, need: 39 },
    ],
    [
      'sideboard wrong size (7)',
      (d) => {
        const sb = d.cards.find((c) => c.section === 'sideboard' && c.quantity === 3);
        if (sb) sb.quantity = 2;
      },
      { section: 'sideboard', have: 7, need: 8 },
    ],
    [
      'rune count wrong (11)',
      (d) => {
        const r = d.cards.find((c) => c.section === 'rune');
        if (r) r.quantity = r.quantity - 1;
      },
      { section: 'rune', have: 11, need: 12 },
    ],
    [
      'battlefield count wrong (2)',
      (d) => {
        d.cards = d.cards.filter((c) => c.cardId !== 'BF-3');
      },
      { section: 'battlefield', have: 2, need: 3 },
    ],
  ];

  for (const [name, mutate, expected] of cases) {
    it(name, () => {
      const deck = validDeck();
      mutate(deck);
      const { errors } = validateDeck(deck, FULL_INDEX);
      const err = errors.find(
        (e): e is Extract<DeckError, { kind: 'wrong_count' }> =>
          e.kind === 'wrong_count' && e.section === expected.section
      );
      assert.ok(err, `expected wrong_count on ${expected.section}`);
      assert.equal(err.have, expected.have);
      assert.equal(err.need, expected.need);
    });
  }
});

describe('validateDeck — battlefield uniqueness', () => {
  it('flags battlefield_duplicate when a battlefield has quantity > 1', () => {
    const deck = validDeck();
    deck.cards = deck.cards.filter(
      (c) => !(c.section === 'battlefield' && (c.cardId === 'BF-2' || c.cardId === 'BF-3'))
    );
    deck.cards.push({ cardId: 'BF-1', section: 'battlefield', quantity: 2 });
    // Re-add one unique battlefield so the count still works for other checks.
    deck.cards.push({ cardId: 'BF-2', section: 'battlefield', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const dup = errors.find((e) => e.kind === 'battlefield_duplicate');
    assert.ok(dup);
    assert.equal(dup.cardId, 'BF-1');
    assert.equal(dup.quantity, 2);
  });
});

describe('validateDeck — copy limit (main + sideboard)', () => {
  it('accepts 3 copies in main (boundary)', () => {
    const deck = validDeck();
    // Replace 3 filler slots with 3x UNIT-A.
    deck.cards = deck.cards.filter(
      (c) => !(c.section === 'main' && ['FILLER-0', 'FILLER-1', 'FILLER-2'].includes(c.cardId))
    );
    deck.cards.push({ cardId: 'UNIT-A', section: 'main', quantity: 3 });
    // Remove UNIT-A from sideboard so total is exactly 3.
    deck.cards = deck.cards.filter((c) => !(c.section === 'sideboard' && c.cardId === 'UNIT-A'));
    // Rebalance sideboard count by adding another copy of GEAR-A... but GEAR-A
    // is already 3 in sideboard which is also the cap. Use a different filler.
    deck.cards.push({ cardId: 'FILLER-0', section: 'sideboard', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    assert.equal(
      errors.find((e) => e.kind === 'copy_limit'),
      undefined,
      `unexpected copy_limit: ${JSON.stringify(errors.filter((e) => e.kind === 'copy_limit'))}`
    );
  });

  it('flags copy_limit when 2 main + 2 sideboard of same card = 4', () => {
    const deck = validDeck();
    // 2x UNIT-A in main (replacing 2 filler).
    deck.cards = deck.cards.filter(
      (c) => !(c.section === 'main' && ['FILLER-0', 'FILLER-1'].includes(c.cardId))
    );
    deck.cards.push({ cardId: 'UNIT-A', section: 'main', quantity: 2 });
    // UNIT-A already 1 in sideboard; add another copy so total main+sb = 4.
    const sbA = deck.cards.find((c) => c.section === 'sideboard' && c.cardId === 'UNIT-A');
    if (sbA) sbA.quantity = 2;
    // Rebalance sideboard total to 8.
    const gear = deck.cards.find((c) => c.section === 'sideboard' && c.cardId === 'GEAR-A');
    if (gear) gear.quantity = 2;

    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find(
      (e): e is Extract<DeckError, { kind: 'copy_limit' }> =>
        e.kind === 'copy_limit' && e.cardId === 'UNIT-A'
    );
    assert.ok(err, `expected copy_limit on UNIT-A; got ${JSON.stringify(errors)}`);
    assert.equal(err.total, 4);
    assert.equal(err.max, 3);
  });

  it('flags copy_limit when 4 copies are all in main', () => {
    const deck = validDeck();
    // Drop 4 filler slots in main and replace with 4x UNIT-A.
    deck.cards = deck.cards.filter(
      (c) =>
        !(c.section === 'main' &&
          ['FILLER-0', 'FILLER-1', 'FILLER-2', 'FILLER-3'].includes(c.cardId))
    );
    deck.cards.push({ cardId: 'UNIT-A', section: 'main', quantity: 4 });
    // Remove UNIT-A from sideboard so the main copies are the only copies.
    deck.cards = deck.cards.filter(
      (c) => !(c.section === 'sideboard' && c.cardId === 'UNIT-A')
    );
    // Rebalance sideboard back to 8 with a filler.
    deck.cards.push({ cardId: 'FILLER-0', section: 'sideboard', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find((e) => e.kind === 'copy_limit');
    assert.ok(err);
    assert.equal(err.total, 4);
  });
});

describe('validateDeck — colour identity', () => {
  it('flags color_violation when a main card uses an off-colour', () => {
    const deck = validDeck();
    // Swap one filler for OFF-COLOR-UNIT in main.
    deck.cards = deck.cards.filter((c) => !(c.section === 'main' && c.cardId === 'FILLER-0'));
    deck.cards.push({ cardId: 'OFF-COLOR-UNIT', section: 'main', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find(
      (e): e is Extract<DeckError, { kind: 'color_violation' }> =>
        e.kind === 'color_violation' && e.cardId === 'OFF-COLOR-UNIT'
    );
    assert.ok(err);
    assert.equal(err.section, 'main');
    assert.deepEqual(err.legendColors, LEGEND_COLORS);
  });

  it('flags color_violation for off-colour cards in sideboard', () => {
    const deck = validDeck();
    // Shrink existing sideboard by 1 and add OFF-COLOR-UNIT.
    const gear = deck.cards.find((c) => c.section === 'sideboard' && c.cardId === 'GEAR-A');
    if (gear) gear.quantity = 2;
    deck.cards.push({ cardId: 'OFF-COLOR-UNIT', section: 'sideboard', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find(
      (e): e is Extract<DeckError, { kind: 'color_violation' }> =>
        e.kind === 'color_violation' && e.cardId === 'OFF-COLOR-UNIT'
    );
    assert.ok(err);
    assert.equal(err.section, 'sideboard');
  });

  it('flags color_violation for off-colour runes', () => {
    const deck = validDeck();
    // Swap 1 body rune for an off-colour rune; total stays at 12.
    const body = deck.cards.find((c) => c.section === 'rune' && c.cardId === 'RUNE-BODY');
    if (body) body.quantity = 5;
    deck.cards.push({ cardId: 'OFF-COLOR-RUNE', section: 'rune', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find(
      (e): e is Extract<DeckError, { kind: 'color_violation' }> =>
        e.kind === 'color_violation' && e.cardId === 'OFF-COLOR-RUNE'
    );
    assert.ok(err);
    assert.equal(err.section, 'rune');
  });

  it('accepts battlefields with off-colour (battlefields are colour-agnostic)', () => {
    const deck = validDeck();
    // Replace BF-3 with BF-OFFCOLOR.
    deck.cards = deck.cards.filter((c) => c.cardId !== 'BF-3');
    deck.cards.push({ cardId: 'BF-OFFCOLOR', section: 'battlefield', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    assert.equal(
      errors.find((e) => e.kind === 'color_violation'),
      undefined
    );
  });
});

describe('validateDeck — section / card-type match', () => {
  it('flags section_type_mismatch for a unit in the rune section', () => {
    const deck = validDeck();
    // Put a unit into the rune section (and fix the rune count down).
    const body = deck.cards.find((c) => c.section === 'rune' && c.cardId === 'RUNE-BODY');
    if (body) body.quantity = 5;
    deck.cards.push({ cardId: 'UNIT-A', section: 'rune', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find(
      (e): e is Extract<DeckError, { kind: 'section_type_mismatch' }> =>
        e.kind === 'section_type_mismatch' && e.cardId === 'UNIT-A' && e.section === 'rune'
    );
    assert.ok(err);
    assert.equal(err.cardType, 'unit');
  });

  it('flags section_type_mismatch for a rune in the main section', () => {
    const deck = validDeck();
    deck.cards = deck.cards.filter((c) => !(c.section === 'main' && c.cardId === 'FILLER-0'));
    deck.cards.push({ cardId: 'RUNE-BODY', section: 'main', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find(
      (e): e is Extract<DeckError, { kind: 'section_type_mismatch' }> =>
        e.kind === 'section_type_mismatch' && e.section === 'main'
    );
    assert.ok(err);
    assert.equal(err.cardType, 'rune');
  });
});

describe('validateDeck — unknown cards', () => {
  it('flags unknown_card for an id missing from the index', () => {
    const deck = validDeck();
    deck.cards = deck.cards.filter((c) => !(c.section === 'main' && c.cardId === 'FILLER-0'));
    deck.cards.push({ cardId: 'DOES-NOT-EXIST', section: 'main', quantity: 1 });
    const { errors } = validateDeck(deck, FULL_INDEX);
    const err = errors.find((e) => e.kind === 'unknown_card');
    assert.ok(err);
    assert.equal(err.cardId, 'DOES-NOT-EXIST');
  });
});

describe('validateDeck — multiple errors', () => {
  it('reports every failing rule in one pass', () => {
    const deck: Deck = {
      legendCardId: null, // missing_legend
      championCardId: null,
      cards: [
        { cardId: 'UNIT-A', section: 'main', quantity: 5 }, // wrong_count + copy_limit
        { cardId: 'BF-1', section: 'battlefield', quantity: 2 }, // battlefield_duplicate + wrong_count
      ],
    };
    const { ok, errors } = validateDeck(deck, FULL_INDEX);
    assert.equal(ok, false);
    const kinds = new Set(errorKinds(errors));
    assert.ok(kinds.has('missing_legend'));
    assert.ok(kinds.has('wrong_count'));
    assert.ok(kinds.has('copy_limit'));
    assert.ok(kinds.has('battlefield_duplicate'));
  });
});
