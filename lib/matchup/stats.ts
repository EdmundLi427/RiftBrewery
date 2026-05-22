import type { CardRow } from '@/lib/cards';
import type { DeckCardEntry } from '@/lib/rules';

export interface PerDeckStats {
  // Energy stats (all cards in scope)
  energy: {
    avg: number;
    median: number;
    histogram: Record<string, number>; // '0', '1', ..., '7+' → count
  };
  // Might stats (units + champion_units only)
  might: {
    avg: number;
    median: number;
    byBucket: {
      low: number;      // ≤ 2 energy
      mid: number;      // 3–5 energy
      topEnd: number;   // ≥ 6 energy
    };
  };
  // Composition (counts by type)
  composition: {
    units: number;
    champions: number;
    spells: number;
    gears: number;
  };
  // Domain breakdown (color count weighted by card quantity)
  domains: Record<string, number>; // e.g. { 'fury': 3, 'calm': 2 }
  // Top tags by frequency (faction / tribal)
  topTags: Array<{ tag: string; count: number }>;
  // Top keywords by frequency (from text_plain)
  topKeywords: Array<{ keyword: string; count: number }>;
  // Spell damage stats
  spellDamage: {
    totalDamage: number;
    damageSpellCount: number;
    avgDamagePerSpell: number;
    singleTargetCount: number;
    multiTargetCount: number;
  };
}

export interface MatchupStats {
  deckA: PerDeckStats & { name: string };
  deckB: PerDeckStats & { name: string };
  comparison: {
    domainOverlap: string[];
    energyDelta: number;
    mightDelta: number;
    spellDensityDelta: number;
    championMatchupLabel: string;
  };
}

interface DeckWithCards {
  legendCardId: string | null;
  championCardId: string | null;
  cards: DeckCardEntry[];
  cardPool: Map<string, CardRow>; // id → full CardRow
  deckName: string;
}

const ENERGY_HISTOGRAM_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

function calculateEnergyHistogram(energies: number[]): Record<string, number> {
  const hist: Record<string, number> = {};
  ENERGY_HISTOGRAM_BUCKETS.forEach((b) => (hist[b] = 0));

  for (const e of energies) {
    const bucket = e >= 7 ? '7+' : String(e);
    if (bucket in hist) hist[bucket]++;
  }

  return hist;
}

function getTopN<T>(arr: T[], n: number = 5): T[] {
  return arr.sort((a: any, b: any) => b.count - a.count).slice(0, n);
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computePerDeckStats(deck: DeckWithCards): PerDeckStats {
  // Gather champion + main cards only
  const inScope: DeckCardEntry[] = [];

  if (deck.championCardId) {
    inScope.push({ cardId: deck.championCardId, section: 'champion', quantity: 1 });
  }

  inScope.push(
    ...deck.cards.filter((c) => c.section === 'main')
  );

  const cardInstances: CardRow[] = [];
  for (const entry of inScope) {
    const card = deck.cardPool.get(entry.cardId);
    if (!card) continue;
    for (let i = 0; i < entry.quantity; i++) {
      cardInstances.push(card);
    }
  }

  // Energy stats
  const energies = cardInstances
    .map((c) => c.energy)
    .filter((e): e is number => e !== null)
    .sort((a, b) => a - b);

  const energyAvg = energies.length > 0 ? energies.reduce((a, b) => a + b, 0) / energies.length : 0;
  const energyMedian = median(energies);

  // Might stats (units + champion_units only)
  const mightCards = cardInstances.filter((c) => c.type === 'unit' || c.type === 'champion_unit');
  const mights = mightCards
    .map((c) => c.might)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);

  const mightAvg = mights.length > 0 ? mights.reduce((a, b) => a + b, 0) / mights.length : 0;
  const mightMedian = median(mights);

  // Might by cost bucket
  const lowEnergyCards = cardInstances.filter(
    (c) => (c.type === 'unit' || c.type === 'champion_unit') && (c.energy ?? 0) <= 2
  );
  const midEnergyCards = cardInstances.filter(
    (c) => (c.type === 'unit' || c.type === 'champion_unit') && (c.energy ?? 0) >= 3 && (c.energy ?? 0) <= 5
  );
  const topEndCards = cardInstances.filter(
    (c) => (c.type === 'unit' || c.type === 'champion_unit') && (c.energy ?? 0) >= 6
  );

  const mightByBucketLow = lowEnergyCards.length > 0
    ? median(lowEnergyCards.map((c) => c.might ?? 0).sort((a, b) => a - b))
    : 0;
  const mightByBucketMid = midEnergyCards.length > 0
    ? median(midEnergyCards.map((c) => c.might ?? 0).sort((a, b) => a - b))
    : 0;
  const mightByBucketTopEnd = topEndCards.length > 0
    ? median(topEndCards.map((c) => c.might ?? 0).sort((a, b) => a - b))
    : 0;

  // Composition
  const composition = {
    units: cardInstances.filter((c) => c.type === 'unit').length,
    champions: cardInstances.filter((c) => c.type === 'champion_unit').length,
    spells: cardInstances.filter((c) => c.type === 'spell').length,
    gears: cardInstances.filter((c) => c.type === 'gear').length,
  };

  // Domains (color identity, weighted by quantity)
  const domainCounts: Record<string, number> = {};
  for (const entry of inScope) {
    const card = deck.cardPool.get(entry.cardId);
    if (!card) continue;
    for (const domain of card.domain) {
      domainCounts[domain] = (domainCounts[domain] ?? 0) + entry.quantity;
    }
  }

  // Tags
  const tagCounts: Record<string, number> = {};
  for (const card of cardInstances) {
    for (const tag of card.tags ?? []) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  const topTags = getTopN(
    Object.entries(tagCounts).map(([tag, count]) => ({ tag, count })),
    5
  );

  // Keywords (string-match text_plain against canonical list)
  const keywordCounts: Record<string, number> = {};
  const cardTexts = cardInstances.map((c) => c.text_plain ?? '').join(' ');
  // TODO: fetch canonical keyword list from card_indexes and match
  // For now, just count common keyword markers (simplified)
  const commonKeywords = [
    'Enduring', 'Ephemeral', 'Fated', 'Attack', 'Block', 'Drain', 'Lifesteal',
  ];
  for (const keyword of commonKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = cardTexts.match(regex);
    if (matches && matches.length > 0) {
      keywordCounts[keyword] = matches.length;
    }
  }
  const topKeywords = getTopN(
    Object.entries(keywordCounts).map(([keyword, count]) => ({ keyword, count })),
    5
  );

  // Spell damage
  let totalDamage = 0;
  let damageSpellCount = 0;
  let singleTargetCount = 0;
  let multiTargetCount = 0;

  for (const entry of inScope) {
    const card = deck.cardPool.get(entry.cardId);
    if (!card || card.type !== 'spell') continue;
    if ((card as any).spell_damage !== null && (card as any).spell_damage !== undefined) {
      totalDamage += ((card as any).spell_damage ?? 0) * entry.quantity;
      damageSpellCount += entry.quantity;
      if ((card as any).spell_damage_targets === 'single') {
        singleTargetCount += entry.quantity;
      } else if ((card as any).spell_damage_targets === 'multi') {
        multiTargetCount += entry.quantity;
      }
    }
  }

  const avgDamagePerSpell = damageSpellCount > 0 ? totalDamage / damageSpellCount : 0;

  return {
    energy: {
      avg: Number(energyAvg.toFixed(2)),
      median: energyMedian,
      histogram: calculateEnergyHistogram(energies),
    },
    might: {
      avg: Number(mightAvg.toFixed(2)),
      median: mightMedian,
      byBucket: {
        low: Number(mightByBucketLow.toFixed(1)),
        mid: Number(mightByBucketMid.toFixed(1)),
        topEnd: Number(mightByBucketTopEnd.toFixed(1)),
      },
    },
    composition,
    domains: domainCounts,
    topTags,
    topKeywords,
    spellDamage: {
      totalDamage,
      damageSpellCount,
      avgDamagePerSpell: Number(avgDamagePerSpell.toFixed(2)),
      singleTargetCount,
      multiTargetCount,
    },
  };
}

export function computeMatchupStats(
  deckA: DeckWithCards,
  deckB: DeckWithCards
): MatchupStats {
  const statsA = computePerDeckStats(deckA);
  const statsB = computePerDeckStats(deckB);

  // Domain overlap
  const domainsA = Object.keys(statsA.domains);
  const domainsB = Object.keys(statsB.domains);
  const overlap = domainsA.filter((d) => domainsB.includes(d));

  // Deltas
  const energyDelta = Number((statsA.energy.avg - statsB.energy.avg).toFixed(2));
  const mightDelta = Number((statsA.might.avg - statsB.might.avg).toFixed(2));
  const spellDensityA = statsA.composition.spells;
  const spellDensityB = statsB.composition.spells;
  const spellDensityDelta = spellDensityA - spellDensityB;

  // Champion matchup label
  const champACard = deckA.cardPool.get(deckA.championCardId || '');
  const champBCard = deckB.cardPool.get(deckB.championCardId || '');
  const champAName = champACard
    ? champACard.name.replace(/\s*\([^)]*\)$/, '').replace(' - ', ', ')
    : 'Unknown';
  const champBName = champBCard
    ? champBCard.name.replace(/\s*\([^)]*\)$/, '').replace(' - ', ', ')
    : 'Unknown';
  const championMatchupLabel = `${champAName} vs ${champBName}`;

  return {
    deckA: { ...statsA, name: deckA.deckName },
    deckB: { ...statsB, name: deckB.deckName },
    comparison: {
      domainOverlap: overlap,
      energyDelta,
      mightDelta,
      spellDensityDelta,
      championMatchupLabel,
    },
  };
}
