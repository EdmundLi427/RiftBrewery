import Link from 'next/link';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';
import NewMatchupClient from './new-matchup-client';

interface DeckRow {
  id: string;
  name: string;
}

export default async function NewMatchupPage() {
  const userId = await getSessionUserId();

  const decks = await sql<DeckRow[]>`
    SELECT id, name
    FROM decks
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;

  return (
    <main className="w-full max-w-2xl">
      <Link href="/dashboard/matchups" className="text-blue-500 hover:underline text-sm mb-4 inline-block">
        ← Back to Matchups
      </Link>

      <h1 className="text-2xl font-bold mb-6">Compare Two Decks</h1>

      {decks.length < 2 ? (
        <div className="bg-blue-50 border border-blue-200 rounded p-6 text-center">
          <p className="text-gray-700 mb-3">You need at least 2 decks to create a comparison.</p>
          <Link href="/dashboard/decks/new" className="text-blue-600 hover:underline font-semibold">
            Create a new deck →
          </Link>
        </div>
      ) : (
        <NewMatchupClient decks={decks} />
      )}
    </main>
  );
}
