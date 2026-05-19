import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';

export default async function PublicDecksPage() {
  await getSessionUserId();

  const decks = await sql<{ id: string; name: string; share_slug: string; owner: string }[]>`
    SELECT d.id, d.name, d.share_slug, u.email AS owner
    FROM decks d
    JOIN users u ON u.id = d.user_id
    WHERE d.is_public = true
    ORDER BY d.updated_at DESC
  `;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">Public Decks</h1>
      {decks.length === 0 ? (
        <p className="text-gray-500">No public decks yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <Link
              key={deck.id}
              href={`/dashboard/decks/${deck.id}`}
              className="block p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-sm transition"
            >
              <p className="font-semibold">{deck.name}</p>
              <p className="text-xs text-gray-500 mt-1">by {deck.owner}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
