import Link from 'next/link';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';

interface DeckRow {
  id: string;
  name: string;
  is_public: boolean;
  share_slug: string | null;
  legend_image_url: string | null;
}

export default async function DecksPage() {
  const userId = await getSessionUserId();

  const decks = await sql<DeckRow[]>`
    SELECT d.id, d.name, d.is_public, d.share_slug,
           c.image_url AS legend_image_url
    FROM decks d
    LEFT JOIN cards c ON c.id = d.legend_card_id
    WHERE d.user_id = ${userId}
    ORDER BY d.updated_at DESC
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
        <div className="grid grid-cols-3 gap-4">
          {decks.map((deck) => (
            <Link
              key={deck.id}
              href={`/dashboard/decks/${deck.id}`}
              className="group block rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg transition bg-white"
            >
              <div className="relative aspect-[5/4] bg-gray-100 overflow-hidden">
                {deck.legend_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={deck.legend_image_url}
                    alt=""
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-5xl select-none">
                    ?
                  </div>
                )}
                {deck.is_public && (
                  <span className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded font-medium">
                    Public
                  </span>
                )}
              </div>
              <div className="px-3 py-2.5">
                <p className="font-semibold text-sm text-gray-900 truncate">{deck.name}</p>
                {deck.is_public && deck.share_slug && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">/d/{deck.share_slug}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
