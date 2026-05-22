import Link from 'next/link';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';

interface MatchupRow {
  id: string;
  deck_a_name: string;
  deck_b_name: string;
  deck_a_champ: string | null;
  deck_b_champ: string | null;
  created_at: string;
  score_a: number | null;
}

export default async function MatchupsPage() {
  const userId = await getSessionUserId();

  const matchups = await sql<MatchupRow[]>`
    SELECT m.id, da.name AS deck_a_name, db.name AS deck_b_name,
           ca.name AS deck_a_champ, cb.name AS deck_b_champ,
           m.created_at, (m.verdict->>'score_a')::int AS score_a
    FROM matchups m
    JOIN decks da ON da.id = m.deck_a_id
    JOIN decks db ON db.id = m.deck_b_id
    LEFT JOIN cards ca ON ca.id = da.champion_card_id
    LEFT JOIN cards cb ON cb.id = db.champion_card_id
    WHERE m.user_id = ${userId}
    ORDER BY m.created_at DESC
  `;

  return (
    <main className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Matchups</h1>
        <Link
          href="/dashboard/matchups/new"
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600"
        >
          New Comparison
        </Link>
      </div>

      {matchups.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded p-6 text-center">
          <p className="text-gray-700 mb-3">No matchups yet.</p>
          <Link
            href="/dashboard/matchups/new"
            className="text-blue-600 hover:underline font-semibold"
          >
            Create your first comparison →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {matchups.map((m) => {
            const scoreA = m.score_a ?? 50;
            const scoreB = 100 - scoreA;
            const formatScore = (s: number) => (s === 50 ? 'Even' : s > 50 ? `${s} / ${scoreB}` : `${scoreA} / ${s}`);

            return (
              <Link
                key={m.id}
                href={`/dashboard/matchups/${m.id}`}
                className="block p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">
                      {m.deck_a_name} vs {m.deck_b_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {m.deck_a_champ && m.deck_b_champ
                        ? `${m.deck_a_champ.replace(/\s*\([^)]*\)$/, '').replace(' - ', ', ')} vs ${m.deck_b_champ.replace(/\s*\([^)]*\)$/, '').replace(' - ', ', ')}`
                        : 'Comparison'}
                    </p>
                  </div>
                  {m.score_a !== null && (
                    <div className="text-right">
                      <p className="font-bold text-sm">{formatScore(scoreA)}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(m.created_at).toLocaleDateString()}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
