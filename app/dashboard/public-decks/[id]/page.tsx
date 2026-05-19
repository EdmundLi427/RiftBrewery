import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUserId } from '@/lib/session';
import sql from '@/lib/db';

interface CardEntry {
  card_id: string;
  section: string;
  quantity: number;
  card_name: string;
  image_url: string | null;
}

export default async function PublicDeckViewPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await getSessionUserId();

  const [deck] = await sql<{
    id: string;
    name: string;
    owner: string;
    legend_name: string | null;
    legend_image: string | null;
    champion_name: string | null;
    champion_image: string | null;
  }[]>`
    SELECT d.id, d.name, u.email AS owner,
           lc.name AS legend_name, lc.image_url AS legend_image,
           cc.name AS champion_name, cc.image_url AS champion_image
    FROM decks d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN cards lc ON lc.id = d.legend_card_id
    LEFT JOIN cards cc ON cc.id = d.champion_card_id
    WHERE d.id = ${id} AND d.is_public = true
    LIMIT 1
  `;

  if (!deck) notFound();

  const cards = await sql<CardEntry[]>`
    SELECT dc.card_id, dc.section, dc.quantity, c.name AS card_name, c.image_url
    FROM deck_cards dc
    JOIN cards c ON c.id = dc.card_id
    WHERE dc.deck_id = ${id}
    ORDER BY dc.section, c.name
  `;

  const formatName = (name: string) =>
    name.replace(/\s*\([^)]*\)$/, '').replace(' - ', ', ');

  const bySection = (section: string) => cards.filter((c) => c.section === section);

  const SectionBlock = ({ title, entries }: { title: string; entries: CardEntry[] }) => {
    if (entries.length === 0) return null;
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</h3>
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.card_id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right text-gray-500 shrink-0">{e.quantity}x</span>
              {e.image_url && (
                <img src={e.image_url} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
              )}
              <span className="truncate">{formatName(e.card_name)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <main className="p-8 max-w-3xl">
      <Link href="/dashboard/public-decks" className="text-blue-500 hover:underline text-sm mb-4 inline-block">
        ← Public Decks
      </Link>

      <div className="flex items-start gap-6 mb-8">
        {deck.legend_image && (
          <img
            src={deck.legend_image}
            alt={deck.legend_name ?? ''}
            className="w-32 rounded-lg object-cover border border-gray-200 shrink-0"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold">{deck.name}</h1>
          {deck.legend_name && (
            <p className="text-gray-500 mt-1">{formatName(deck.legend_name)}</p>
          )}
          {deck.champion_name && (
            <p className="text-gray-400 text-sm mt-0.5">{formatName(deck.champion_name)}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">by {deck.owner}</p>
        </div>
      </div>

      <div className="space-y-6">
        <SectionBlock title="Battlefield" entries={bySection('battlefield')} />
        <SectionBlock title="Rune" entries={bySection('rune')} />
        <SectionBlock title="Main" entries={bySection('main')} />
        <SectionBlock title="Sideboard" entries={bySection('sideboard')} />
      </div>
    </main>
  );
}
