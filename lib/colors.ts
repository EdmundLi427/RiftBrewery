/**
 * Color/Domain vocabulary for Riftbound.
 *
 * Database and code use lowercase "colors".
 * UI displays them as "Domains" with human-friendly labels.
 */

export const COLORS = ['fury', 'mind', 'body', 'chaos', 'order', 'calm'] as const;

export type Color = (typeof COLORS)[number];

export const COLOR_LABEL: Record<Color, string> = {
  fury: 'Fury',   // red
  mind: 'Mind',   // blue
  body: 'Body',   // orange
  chaos: 'Chaos', // purple
  order: 'Order', // yellow
  calm: 'Calm',   // green
};
