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

  return (
    <main className="w-full max-w-4xl">
      <Link href="/dashboard/matchups" className="text-blue-500 hover:underline text-sm mb-4 inline-block">
        ← Back to Matchups
      </Link>

      <MatchupClient
        matchupId={matchup.id}
        stats={matchup.stats}
        gameplanA={matchup.gameplan_a}
        gameplanB={matchup.gameplan_b}
        interaction={matchup.interaction}
        verdict={matchup.verdict}
      />
    </main>
  );
}
