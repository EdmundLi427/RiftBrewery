import Link from 'next/link';
import sql from '@/lib/db';
import type { CardRow } from '@/lib/cards';

interface PublicDeck {
  id: string;
  name: string;
  legend_card_id: string;
}

interface DeckCard {
  card_id: string;
  section: 'main' | 'sideboard' | 'battlefield' | 'rune';
  quantity: number;
}

export default async function PublicSharePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;

  // Get public deck by slug
  const [deck] = await sql<PublicDeck[]>`
    SELECT id, name, legend_card_id FROM decks
    WHERE is_public = true AND share_slug = ${slug}
    LIMIT 1
  `;

  if (!deck) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-lg text-gray-600 mb-4">Deck not found or not public.</p>
        <Link href="/" className="text-blue-500 hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  // Get deck cards
  const deckCards = await sql<DeckCard[]>`
    SELECT card_id, section, quantity
    FROM deck_cards
    WHERE deck_id = ${deck.id}
  `;

  // Get card details
  const cardIds = [deck.legend_card_id, ...deckCards.map((dc) => dc.card_id)];
  const cardRows = await sql<CardRow[]>`
    SELECT id, riftbound_id, name, type, supertype, rarity, domain,
           energy, might, power, text_plain, text_flavour,
           set_id, set_label, image_url, tags, champion_key
      FROM cards WHERE id = ANY(${cardIds})
  `;

  const cardMap = new Map(cardRows.map((c) => [c.id, { id: c.id, name: c.name, type: c.type }]));

  // Group by section
  const sections = {
    main: deckCards.filter((dc) => dc.section === 'main'),
    sideboard: deckCards.filter((dc) => dc.section === 'sideboard'),
    battlefield: deckCards.filter((dc) => dc.section === 'battlefield'),
    rune: deckCards.filter((dc) => dc.section === 'rune'),
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">
          ← Back
        </Link>
        <h1 className="text-3xl font-bold">{deck.name}</h1>
        <p className="text-gray-600 mt-1">
          Legend: <span className="font-mono">{deck.legend_card_id}</span>
        </p>
        {cardMap.get(deck.legend_card_id) && (
          <p className="text-sm text-gray-500">
            {cardMap.get(deck.legend_card_id)!.name}
          </p>
        )}
      </div>

      {/* Deck sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(
          [
            { title: 'Main Deck (40)', key: 'main' as const },
            { title: 'Sideboard (8)', key: 'sideboard' as const },
            { title: 'Runes (12)', key: 'rune' as const },
            { title: 'Battlefields (3)', key: 'battlefield' as const },
          ] as const
        ).map(({ title, key }) => (
          <div key={key} className="border border-gray-200 rounded p-4">
            <h2 className="font-semibold text-lg mb-3">{title}</h2>
            {sections[key].length === 0 ? (
              <p className="text-gray-500 text-sm">Empty</p>
            ) : (
              <ul className="space-y-1">
                {sections[key].map((entry) => {
                  const card = cardMap.get(entry.card_id);
                  return (
                    <li key={`${entry.card_id}-${key}`} className="text-sm">
                      <span className="font-semibold">×{entry.quantity}</span> {card?.name || entry.card_id}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
