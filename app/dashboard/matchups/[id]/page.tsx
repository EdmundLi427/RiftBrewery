import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';
import MatchupClient from './matchup-client';

interface Matchup {
  id: string;
  deck_a_id: string;
  deck_b_id: string;
  stats: any;
  gameplan_a: any;
  gameplan_b: any;
  interaction: any;
  verdict: any;
}

export default async function MatchupPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const userId = await getSessionUserId();

  const [matchup] = await sql<Matchup[]>`
    SELECT id, deck_a_id, deck_b_id, stats, gameplan_a, gameplan_b, interaction, verdict
    FROM matchups
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `;

  if (!matchup) notFound();

  const stats = typeof matchup.stats === 'string' ? JSON.parse(matchup.stats) : matchup.stats;
  const gameplanA = matchup.gameplan_a ? (typeof matchup.gameplan_a === 'string' ? JSON.parse(matchup.gameplan_a) : matchup.gameplan_a) : null;
  const gameplanB = matchup.gameplan_b ? (typeof matchup.gameplan_b === 'string' ? JSON.parse(matchup.gameplan_b) : matchup.gameplan_b) : null;
  const interaction = matchup.interaction ? (typeof matchup.interaction === 'string' ? JSON.parse(matchup.interaction) : matchup.interaction) : null;
  const verdict = matchup.verdict ? (typeof matchup.verdict === 'string' ? JSON.parse(matchup.verdict) : matchup.verdict) : null;

  return (
    <main className="w-full max-w-4xl">
      <Link href="/dashboard/matchups" className="text-blue-500 hover:underline text-sm mb-4 inline-block">
        ← Back to Matchups
      </Link>

      <MatchupClient
        matchupId={matchup.id}
        stats={stats}
        gameplanA={gameplanA}
        gameplanB={gameplanB}
        interaction={interaction}
        verdict={verdict}
      />
    </main>
  );
}
