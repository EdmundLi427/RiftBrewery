import Link from 'next/link';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';

interface Deck {
  id: string;
  name: string;
  legend_card_id: string;
  is_public: boolean;
  share_slug: string | null;
}

export default async function DecksPage() {
  const userId = await getSessionUserId();

  const decks = await sql<Deck[]>`
    SELECT id, name, legend_card_id, is_public, share_slug
    FROM decks
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;

  return (
    <main className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Decks</h1>
        <Link
          href="/dashboard/decks/new"
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600"
        >
          New Deck
        </Link>
      </div>

      {decks.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded p-6 text-center">
          <p className="text-gray-700 mb-3">No decks yet.</p>
          <Link
            href="/dashboard/decks/new"
            className="text-blue-600 hover:underline font-semibold"
          >
            Create your first deck →
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="bg-white border border-gray-200 rounded p-4 flex items-center justify-between hover:shadow transition"
            >
              <div className="flex-1">
                <Link
                  href={`/dashboard/decks/${deck.id}`}
                  className="font-semibold text-blue-600 hover:underline text-lg"
                >
                  {deck.name}
                </Link>
                {deck.is_public && deck.share_slug && (
                  <p className="text-xs text-green-600 mt-1">Public • Slug: {deck.share_slug}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/dashboard/decks/${deck.id}`}
                  className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
