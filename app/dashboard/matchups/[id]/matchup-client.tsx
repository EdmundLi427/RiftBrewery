'use client'

import { useState, useEffect } from 'react';
import { populateGameplans, populateInteraction, populateVerdict } from './actions';
import type { MatchupStats } from '@/lib/matchup/stats';
import type { Gameplan, Interaction, Verdict } from '@/lib/matchup/ai';

interface Props {
  matchupId: string;
  stats: MatchupStats;
  gameplanA: Gameplan | null;
  gameplanB: Gameplan | null;
  interaction: Interaction | null;
  verdict: Verdict | null;
}

export default function MatchupClient({
  matchupId,
  stats: initialStats,
  gameplanA: initialGameplanA,
  gameplanB: initialGameplanB,
  interaction: initialInteraction,
  verdict: initialVerdict,
}: Props) {
  const [gameplanA, setGameplanA] = useState(initialGameplanA);
  const [gameplanB, setGameplanB] = useState(initialGameplanB);
  const [interaction, setInteraction] = useState(initialInteraction);
  const [verdict, setVerdict] = useState(initialVerdict);

  const [loading, setLoading] = useState({ gameplans: false, interaction: false, verdict: false });
  const [errors, setErrors] = useState<string[]>([]);

  // Auto-populate AI stages on mount
  useEffect(() => {
    if (!gameplanA || !gameplanB) {
      populateGeplans();
    }
  }, [gameplanA, gameplanB]);

  const populateGeplans = async () => {
    setLoading((prev) => ({ ...prev, gameplans: true }));
    try {
      await populateGameplans(matchupId);
      // Would need to refetch to see updates, so we'll rely on server revalidation
      // For now, just show loading state
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setErrors((prev) => [...prev, err instanceof Error ? err.message : 'Failed to generate gameplans']);
      setLoading((prev) => ({ ...prev, gameplans: false }));
    }
  };

  const populateInteractionAI = async () => {
    setLoading((prev) => ({ ...prev, interaction: true }));
    try {
      await populateInteraction(matchupId);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setErrors((prev) => [...prev, err instanceof Error ? err.message : 'Failed to generate interaction']);
      setLoading((prev) => ({ ...prev, interaction: false }));
    }
  };

  const populateVerdictAI = async () => {
    setLoading((prev) => ({ ...prev, verdict: true }));
    try {
      await populateVerdict(matchupId);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setErrors((prev) => [...prev, err instanceof Error ? err.message : 'Failed to generate verdict']);
      setLoading((prev) => ({ ...prev, verdict: false }));
    }
  };

  const stats = initialStats as any;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">{stats.deckA.name} vs {stats.deckB.name}</h1>

      {/* Stats Comparison */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Stats Comparison</h2>
        <div className="grid grid-cols-2 gap-6">
          {/* Energy */}
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm mb-2">Energy</h3>
            <p className="text-xs text-gray-600">
              Deck A: avg {stats.deckA.energy.avg}, median {stats.deckA.energy.median}
            </p>
            <p className="text-xs text-gray-600">
              Deck B: avg {stats.deckB.energy.avg}, median {stats.deckB.energy.median}
            </p>
          </div>

          {/* Might */}
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm mb-2">Might (by Cost Bucket)</h3>
            <p className="text-xs text-gray-600">
              Deck A: low {stats.deckA.might.byBucket.low}, mid {stats.deckA.might.byBucket.mid}, top{' '}
              {stats.deckA.might.byBucket.topEnd}
            </p>
            <p className="text-xs text-gray-600">
              Deck B: low {stats.deckB.might.byBucket.low}, mid {stats.deckB.might.byBucket.mid}, top{' '}
              {stats.deckB.might.byBucket.topEnd}
            </p>
          </div>

          {/* Composition */}
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm mb-2">Composition</h3>
            <p className="text-xs text-gray-600">
              Deck A: {stats.deckA.composition.units}u, {stats.deckA.composition.spells}s, {stats.deckA.composition.gears}g
            </p>
            <p className="text-xs text-gray-600">
              Deck B: {stats.deckB.composition.units}u, {stats.deckB.composition.spells}s, {stats.deckB.composition.gears}g
            </p>
          </div>

          {/* Spell Damage */}
          <div className="p-4 border border-gray-200 rounded-lg">
            <h3 className="font-semibold text-sm mb-2">Spell Damage</h3>
            <p className="text-xs text-gray-600">Deck A: {stats.deckA.spellDamage.totalDamage} total damage</p>
            <p className="text-xs text-gray-600">Deck B: {stats.deckB.spellDamage.totalDamage} total damage</p>
          </div>
        </div>
      </section>

      {/* Gameplans */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Gameplans</h2>
          {!gameplanA || !gameplanB ? (
            <button
              onClick={populateGeplans}
              disabled={loading.gameplans}
              className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading.gameplans ? 'Generating...' : 'Generate'}
            </button>
          ) : null}
        </div>

        {gameplanA && gameplanB ? (
          <div className="grid grid-cols-2 gap-6">
            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-sm mb-2">{stats.deckA.name}</h3>
              <p className="text-xs text-gray-600 mb-2">
                <span className="font-semibold">{gameplanA.archetype}</span> / {gameplanA.board_shape}
              </p>
              <p className="text-xs mb-2">{gameplanA.summary}</p>
              <div>
                <p className="text-xs font-semibold mb-1">Key Cards:</p>
                <ul className="text-xs space-y-1">
                  {gameplanA.key_cards.map((kc, i) => (
                    <li key={i}>
                      {kc.name}: {kc.role}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-4 border border-gray-200 rounded-lg">
              <h3 className="font-semibold text-sm mb-2">{stats.deckB.name}</h3>
              <p className="text-xs text-gray-600 mb-2">
                <span className="font-semibold">{gameplanB.archetype}</span> / {gameplanB.board_shape}
              </p>
              <p className="text-xs mb-2">{gameplanB.summary}</p>
              <div>
                <p className="text-xs font-semibold mb-1">Key Cards:</p>
                <ul className="text-xs space-y-1">
                  {gameplanB.key_cards.map((kc, i) => (
                    <li key={i}>
                      {kc.name}: {kc.role}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center text-sm text-gray-600">
            Generating gameplans...
          </div>
        )}
      </section>

      {/* Interaction */}
      {gameplanA && gameplanB && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Interaction</h2>
            {!interaction ? (
              <button
                onClick={populateInteractionAI}
                disabled={loading.interaction}
                className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading.interaction ? 'Analyzing...' : 'Analyze'}
              </button>
            ) : null}
          </div>

          {interaction ? (
            <div className="p-4 border border-gray-200 rounded-lg">
              <p className="text-sm mb-4">{interaction.summary}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold mb-2">Deck A Advantages</p>
                  <ul className="text-xs space-y-1">
                    {interaction.deck_a_advantages.map((adv, i) => (
                      <li key={i}>• {adv}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-2">Deck B Advantages</p>
                  <ul className="text-xs space-y-1">
                    {interaction.deck_b_advantages.map((adv, i) => (
                      <li key={i}>• {adv}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center text-sm text-gray-600">
              Waiting for gameplans...
            </div>
          )}
        </section>
      )}

      {/* Verdict */}
      {interaction && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Verdict</h2>
            {!verdict ? (
              <button
                onClick={populateVerdictAI}
                disabled={loading.verdict}
                className="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading.verdict ? 'Finalizing...' : 'Finalize'}
              </button>
            ) : null}
          </div>

          {verdict ? (
            <div className="p-6 border-2 border-blue-400 rounded-lg bg-blue-50">
              <div className="text-center mb-4">
                <p className="text-lg font-bold">
                  {stats.deckA.name}{' '}
                  <span className="text-2xl">{verdict.score_a}</span> /{' '}
                  {stats.deckB.name}{' '}
                  <span className="text-2xl">{100 - verdict.score_a}</span>
                </p>
              </div>
              <p className="text-sm">{verdict.reasoning}</p>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center text-sm text-gray-600">
              Waiting for interaction analysis...
            </div>
          )}
        </section>
      )}

      {errors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          {errors.map((err, i) => (
            <p key={i} className="text-sm text-red-700">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
