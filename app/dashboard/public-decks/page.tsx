import Link from 'next/link';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';

export default async function PublicDecksPage() {
  await getSessionUserId();

  const decks = await sql<{
    id: string;
    name: string;
    owner: string;
    legend_name: string | null;
    legend_image: string | null;
  }[]>`
    SELECT d.id, d.name, u.email AS owner,
           c.name AS legend_name, c.image_url AS legend_image
    FROM decks d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN cards c ON c.id = d.legend_card_id
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
              className="flex items-center gap-4 p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-sm transition"
            >
              {deck.legend_image ? (
                <img
                  src={deck.legend_image}
                  alt={deck.legend_name ?? 'Legend'}
                  className="w-14 h-14 rounded-full object-cover shrink-0 border border-gray-200"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gray-100 shrink-0 border border-gray-200" />
              )}
              <div className="min-w-0">
                <p className="font-semibold truncate">{deck.name}</p>
                {deck.legend_name && (
                  <p className="text-xs text-gray-500 truncate">{deck.legend_name.replace(/\s*\([^)]*\)$/, '').replace(' - ', ', ')}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">by {deck.owner}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
