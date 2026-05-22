import { default as Anthropic } from '@anthropic-ai/sdk';
import type { PerDeckStats } from './stats';
import { RIFTBOUND_EXPERT_PROMPT, GAMEPLAN_TASK_PROMPT, INTERACTION_TASK_PROMPT, VERDICT_TASK_PROMPT } from './prompts';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface Gameplan {
  archetype: 'aggro' | 'midrange' | 'control' | 'combo';
  board_shape: 'wide' | 'tall';
  summary: string;
  win_conditions: string[];
  key_cards: Array<{ name: string; role: string }>;
  weaknesses: string[];
}

export interface Interaction {
  summary: string;
  deck_a_advantages: string[];
  deck_b_advantages: string[];
}

export interface Verdict {
  score_a: number;
  reasoning: string;
}

/**
 * Run gameplan analysis on a single deck (Haiku).
 * Input: card list + computed stats. Output: structured gameplan.
 */
export async function runGameplan(
  cardList: Array<{ quantity: number; name: string; type: string; energy?: number | null; might?: number | null; text?: string }>,
  stats: PerDeckStats
): Promise<Gameplan> {
  const cardListText = cardList
    .map((c) => `${c.quantity}x ${c.name} (${c.type}, cost ${c.energy ?? 'N/A'})`)
    .join('\n');

  const statsText = `
Energy: avg ${stats.energy.avg}, median ${stats.energy.median}
Might: avg ${stats.might.avg}, median ${stats.might.median}
Might by bucket: low ${stats.might.byBucket.low}, mid ${stats.might.byBucket.mid}, top ${stats.might.byBucket.topEnd}
Composition: ${stats.composition.units} units, ${stats.composition.champions} champions, ${stats.composition.spells} spells, ${stats.composition.gears} gears
Spell damage: ${stats.spellDamage.totalDamage} total, ${stats.spellDamage.damageSpellCount} spells
Domains: ${Object.entries(stats.domains)
    .map(([d, c]) => `${d}×${c}`)
    .join(', ')}
`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20241001',
    max_tokens: 1000,
    system: RIFTBOUND_EXPERT_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${GAMEPLAN_TASK_PROMPT}\n\nCard List:\n${cardListText}\n\nStats:\n${statsText}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const parsed = JSON.parse(text);

  // Sanity check: discard key_cards with names not in the original card list
  const cardNames = new Set(cardList.map((c) => c.name));
  parsed.key_cards = parsed.key_cards.filter((kc: any) => cardNames.has(kc.name));

  return parsed as Gameplan;
}

/**
 * Run interaction analysis (Sonnet).
 * Input: both gameplans + both stats + deltas. Output: interaction summary.
 */
export async function runInteraction(
  gameplanA: Gameplan,
  gameplanB: Gameplan,
  statsA: PerDeckStats,
  statsB: PerDeckStats,
  deltas: {
    domainOverlap: string[];
    energyDelta: number;
    mightDelta: number;
    spellDensityDelta: number;
  }
): Promise<Interaction> {
  const contextText = `
Deck A Gameplan:
- Archetype: ${gameplanA.archetype}, Board Shape: ${gameplanA.board_shape}
- Summary: ${gameplanA.summary}
- Win Conditions: ${gameplanA.win_conditions.join('; ')}
- Key Cards: ${gameplanA.key_cards.map((k) => `${k.name} (${k.role})`).join(', ')}
- Weaknesses: ${gameplanA.weaknesses.join('; ')}

Deck B Gameplan:
- Archetype: ${gameplanB.archetype}, Board Shape: ${gameplanB.board_shape}
- Summary: ${gameplanB.summary}
- Win Conditions: ${gameplanB.win_conditions.join('; ')}
- Key Cards: ${gameplanB.key_cards.map((k) => `${k.name} (${k.role})`).join(', ')}
- Weaknesses: ${gameplanB.weaknesses.join('; ')}

Stats Comparison:
- Domain Overlap: ${deltas.domainOverlap.join(', ') || 'None'}
- Energy Delta: ${deltas.energyDelta > 0 ? '+' : ''}${deltas.energyDelta}
- Might Delta: ${deltas.mightDelta > 0 ? '+' : ''}${deltas.mightDelta}
- Spell Density Delta: ${deltas.spellDensityDelta > 0 ? '+' : ''}${deltas.spellDensityDelta}
`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: RIFTBOUND_EXPERT_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${INTERACTION_TASK_PROMPT}\n\n${contextText}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as Interaction;
}

/**
 * Run verdict / summary (Sonnet).
 * Input: both gameplans + interaction. Output: score + reasoning.
 */
export async function runVerdict(
  gameplanA: Gameplan,
  gameplanB: Gameplan,
  interaction: Interaction
): Promise<Verdict> {
  const contextText = `
Deck A: ${gameplanA.archetype.toUpperCase()} (${gameplanA.board_shape})
Deck B: ${gameplanB.archetype.toUpperCase()} (${gameplanB.board_shape})

Interaction Summary: ${interaction.summary}

Deck A Advantages: ${interaction.deck_a_advantages.join('; ')}
Deck B Advantages: ${interaction.deck_b_advantages.join('; ')}
`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: RIFTBOUND_EXPERT_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${VERDICT_TASK_PROMPT}\n\n${contextText}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const parsed = JSON.parse(text);

  // Round score to nearest 5
  const score = Math.round(parsed.score_a / 5) * 5;
  parsed.score_a = Math.max(0, Math.min(100, score));

  return parsed as Verdict;
}
