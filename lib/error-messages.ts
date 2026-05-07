import { DeckError } from './rules';

/**
 * Translate DeckError kinds into human-readable messages.
 * Requires a card index to look up card names.
 */
export function formatDeckError(
  error: DeckError,
  cardIndex?: Map<string, { name: string }>
): string {
  const getCardName = (cardId: string): string => {
    return cardIndex?.get(cardId)?.name || cardId;
  };

  switch (error.kind) {
    case 'missing_legend':
      return 'Pick a legend.';

    case 'legend_not_a_legend_card':
      return 'Legend slot must hold a legend card.';

    case 'legend_color_count':
      return `Legend must have exactly 2 colours (has ${error.colors.length}).`;

    case 'champion_legend_mismatch':
      return `Champion must match your legend.`;

    case 'wrong_count':
      if (error.section === 'champion') {
        return `Champion: select 1 card.`;
      }
      const sectionName = error.section.charAt(0).toUpperCase() + error.section.slice(1);
      return `${sectionName} needs ${error.need} cards (have ${error.have}).`;

    case 'battlefield_duplicate':
      return `Battlefields must be unique (${getCardName(error.cardId)}).`;

    case 'copy_limit':
      return `Too many copies of ${getCardName(error.cardId)} (${error.total}/${error.max}).`;

    case 'color_violation':
      return `${getCardName(error.cardId)} is off-colour for this legend.`;

    case 'section_type_mismatch':
      if (error.section === 'champion') {
        return `${getCardName(error.cardId)} can't be a champion.`;
      }
      return `${getCardName(error.cardId)} can't go in ${error.section}.`;

    case 'unknown_card':
      return `A card in this deck is no longer available (${error.cardId}).`;

    default:
      return 'An unknown error occurred.';
  }
}
