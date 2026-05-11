// Deck-building rules for Riftbound.
//
// Config and validator live together on purpose: the rules config is small,
// and keeping validateDeck() next to the constants makes it easy to spot when
// a rule change would also need a validator update.

export type CardType =
  | 'legend'
  | 'unit'
  | 'champion_unit'
  | 'spell'
  | 'gear'
  | 'battlefield'
  | 'rune';

export type DeckSection = 'main' | 'sideboard' | 'battlefield' | 'rune' | 'champion';

/**
 * Canonical card shape consumed by the validator. Riot API payloads get
 * normalised into this at ingest time.
 */
export interface Card {
  id: string;
  name: string;
  type: CardType;
  /** Lowercase colour strings, e.g. ["body", "calm"]. Order-insensitive. */
  colors: string[];
}

export interface DeckCardEntry {
  cardId: string;
  section: DeckSection;
  quantity: number;
}

/**
 * Logical deck. Legend and champion are tracked separately because they're 1-ofs and live in
 * their own DB columns rather than in `deck_cards`.
 */
export interface Deck {
  legendCardId: string | null;
  championCardId: string | null;
  cards: DeckCardEntry[];
}

export const DECK_RULES = {
  // Main is 39 "other" cards; the chosen champion (in its own section)
  // counts toward the deck's 40-card total. So a legal deck has:
  //   1 champion + 39 main + 3 battlefields + 12 runes = 55 in play
  mainDeckSize: 39,
  championCount: 1,
  sideboardSize: 8,
  runeCount: 12,
  battlefieldCount: 3,
  battlefieldUnique: true,
  legendColorCount: 2,
  maxCopiesPerCard: 3,
  /** Copy cap is summed across champion + main + sideboard. Runes/battlefields have their own rules. */
  copyLimitScope: new Set<DeckSection>(['champion', 'main', 'sideboard']),
} as const;

// Which card types are legal in each section.
const SECTION_CARD_TYPES: Record<DeckSection, readonly CardType[]> = {
  champion: ['champion_unit'],
  main: ['unit', 'champion_unit', 'spell', 'gear'],
  sideboard: ['unit', 'champion_unit', 'spell', 'gear'],
  battlefield: ['battlefield'],
  rune: ['rune'],
};

export type DeckError =
  | { kind: 'missing_legend' }
  | { kind: 'legend_not_a_legend_card'; cardId: string; cardType: CardType }
  | { kind: 'legend_color_count'; cardId: string; colors: string[]; expected: number }
  | { kind: 'champion_legend_mismatch'; championCardId: string; legendCardId: string }
  | { kind: 'wrong_count'; section: DeckSection; have: number; need: number }
  | { kind: 'battlefield_duplicate'; cardId: string; quantity: number }
  | { kind: 'copy_limit'; cardId: string; total: number; max: number }
  | {
      kind: 'color_violation';
      cardId: string;
      cardColors: string[];
      legendColors: string[];
      section: DeckSection;
    }
  | { kind: 'section_type_mismatch'; cardId: string; section: DeckSection; cardType: CardType }
  | { kind: 'unknown_card'; cardId: string };

export interface ValidationResult {
  ok: boolean;
  errors: DeckError[];
}

/**
 * Validate a deck against the constructed-format rules.
 *
 * Pure function: does not read from a DB or mutate its inputs. Callers pass in
 * a card index (id -> Card) covering every card referenced by the deck.
 *
 * Errors are returned in a deterministic order (legend checks → champion checks → section counts
 * → per-section checks → per-card checks) so tests and UI can rely on it.
 */
export function validateDeck(
  deck: Deck,
  cardIndex: Map<string, Card> | Record<string, Card>,
  options?: { championKeyMap?: Map<string, string> }
): ValidationResult {
  const lookup: (id: string) => Card | undefined =
    cardIndex instanceof Map
      ? (id) => cardIndex.get(id)
      : (id) => (cardIndex as Record<string, Card>)[id];

  const errors: DeckError[] = [];

  // --- Legend ------------------------------------------------------------
  let legendColors: string[] | null = null;
  let legendCard: Card | undefined;
  if (!deck.legendCardId) {
    errors.push({ kind: 'missing_legend' });
  } else {
    legendCard = lookup(deck.legendCardId);
    if (!legendCard) {
      errors.push({ kind: 'unknown_card', cardId: deck.legendCardId });
    } else if (legendCard.type !== 'legend') {
      errors.push({
        kind: 'legend_not_a_legend_card',
        cardId: legendCard.id,
        cardType: legendCard.type,
      });
    } else if (legendCard.colors.length !== DECK_RULES.legendColorCount) {
      errors.push({
        kind: 'legend_color_count',
        cardId: legendCard.id,
        colors: legendCard.colors,
        expected: DECK_RULES.legendColorCount,
      });
    } else {
      legendColors = legendCard.colors;
    }
  }

  // --- Champion checks ---------------------------------------------------
  if (deck.championCardId) {
    const champion = lookup(deck.championCardId);
    if (!champion) {
      errors.push({ kind: 'unknown_card', cardId: deck.championCardId });
    } else if (champion.type !== 'champion_unit') {
      errors.push({
        kind: 'section_type_mismatch',
        cardId: champion.id,
        section: 'champion',
        cardType: champion.type,
      });
    } else if (legendCard && legendCard.type === 'legend') {
      // Check champion-legend mismatch using champion key if available
      const championKeyMap = options?.championKeyMap;
      let matches = false;

      if (championKeyMap) {
        const legendKey = championKeyMap.get(legendCard.id);
        const championKey = championKeyMap.get(champion.id);
        if (legendKey && championKey && legendKey === championKey) {
          matches = true;
        }
      }

      // Fallback: name substring match
      if (!matches) {
        const championName = champion.name.split(',')[0].trim(); // "Draven" from "Draven, Showboat"
        matches = legendCard.name.includes(championName);
      }

      if (!matches) {
        errors.push({
          kind: 'champion_legend_mismatch',
          championCardId: champion.id,
          legendCardId: legendCard.id,
        });
      }
    }
  }

  // --- Section counts ----------------------------------------------------
  const countBySection: Record<DeckSection, number> = {
    champion: deck.championCardId ? 1 : 0,
    main: 0,
    sideboard: 0,
    battlefield: 0,
    rune: 0,
  };
  for (const entry of deck.cards) {
    countBySection[entry.section] += entry.quantity;
  }

  const expectedCounts: Array<[DeckSection, number]> = [
    ['main', DECK_RULES.mainDeckSize],
    ['sideboard', DECK_RULES.sideboardSize],
    ['rune', DECK_RULES.runeCount],
    ['battlefield', DECK_RULES.battlefieldCount],
  ];
  for (const [section, need] of expectedCounts) {
    if (countBySection[section] !== need) {
      errors.push({
        kind: 'wrong_count',
        section,
        have: countBySection[section],
        need,
      });
    }
  }

  // Champion is optional (0 or 1), but if present must be exactly 1
  if (countBySection['champion'] > DECK_RULES.championCount) {
    errors.push({
      kind: 'wrong_count',
      section: 'champion',
      have: countBySection['champion'],
      need: DECK_RULES.championCount,
    });
  }

  // --- Battlefield uniqueness -------------------------------------------
  if (DECK_RULES.battlefieldUnique) {
    for (const entry of deck.cards) {
      if (entry.section === 'battlefield' && entry.quantity > 1) {
        errors.push({
          kind: 'battlefield_duplicate',
          cardId: entry.cardId,
          quantity: entry.quantity,
        });
      }
    }
  }

  // --- Champion + main + sideboard copy limit ----------------------------
  const copyTotals = new Map<string, number>();

  // Include champion in copy limit
  if (deck.championCardId) {
    copyTotals.set(deck.championCardId, 1);
  }

  for (const entry of deck.cards) {
    if (!DECK_RULES.copyLimitScope.has(entry.section)) continue;
    copyTotals.set(entry.cardId, (copyTotals.get(entry.cardId) ?? 0) + entry.quantity);
  }

  for (const [cardId, total] of copyTotals) {
    if (total > DECK_RULES.maxCopiesPerCard) {
      errors.push({
        kind: 'copy_limit',
        cardId,
        total,
        max: DECK_RULES.maxCopiesPerCard,
      });
    }
  }

  // --- Per-card section-type + colour-identity checks -------------------
  for (const entry of deck.cards) {
    const card = lookup(entry.cardId);
    if (!card) {
      errors.push({ kind: 'unknown_card', cardId: entry.cardId });
      continue;
    }

    const allowedTypes = SECTION_CARD_TYPES[entry.section];
    if (!allowedTypes.includes(card.type)) {
      errors.push({
        kind: 'section_type_mismatch',
        cardId: card.id,
        section: entry.section,
        cardType: card.type,
      });
    }

    // Colour identity: champion / main / sideboard / rune must be a subset of legend.
    // Battlefields are colour-agnostic.
    const checkColors =
      entry.section === 'champion' ||
      entry.section === 'main' ||
      entry.section === 'sideboard' ||
      entry.section === 'rune';

    if (checkColors && legendColors !== null) {
      const offending = card.colors.filter((c) => !legendColors!.includes(c));
      if (offending.length > 0) {
        errors.push({
          kind: 'color_violation',
          cardId: card.id,
          cardColors: card.colors,
          legendColors,
          section: entry.section,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
