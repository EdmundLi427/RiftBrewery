import Link from 'next/link';
import { getCard } from '../actions';
import { COLOR_LABEL, type Color } from '@/lib/colors';

export default async function CardDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const card = await getCard(id);

  if (!card) {
    return (
      <div>
        <p className="text-red-500">Card not found.</p>
        <Link href="/dashboard/cards" className="text-blue-500 hover:underline">
          Back to browsing
        </Link>
      </div>
    );
  }

  // Format domain with human-readable labels
  const domainDisplay = card.domain.length > 0
    ? card.domain.map(d => COLOR_LABEL[d as Color] ?? d).join(', ')
    : 'Colorless';

  return (
    <div className="w-full max-w-2xl">
      <Link href="/dashboard/cards" className="text-blue-500 hover:underline mb-4 inline-block">
        ← Back to cards
      </Link>

      <div className="bg-white border border-gray-200 rounded p-6">
        <h1 className="text-3xl font-bold mb-2">{card.name}</h1>
        <p className="text-gray-600 mb-4">
          <span className="capitalize font-semibold">{card.type}</span>
          {card.supertype && (
            <span className="ml-2 text-sm">({card.supertype})</span>
          )}
          <span className="ml-2">
            • {domainDisplay}
          </span>
        </p>

        {/* Card image */}
        <div className="w-full bg-gray-100 rounded mb-6 overflow-hidden" style={{ aspectRatio: '1/1', maxWidth: '300px' }}>
          <img
            src={card.image_url}
            alt={card.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            {card.energy !== null && (
              <div>
                <h2 className="font-semibold mb-1">Energy Cost</h2>
                <p className="text-gray-700 text-lg font-bold">{card.energy}</p>
              </div>
            )}
            {card.might !== null && (
              <div>
                <h2 className="font-semibold mb-1">Might</h2>
                <p className="text-gray-700 text-lg font-bold">{card.might}</p>
              </div>
            )}
            {card.power !== null && (
              <div>
                <h2 className="font-semibold mb-1">Power</h2>
                <p className="text-gray-700 text-lg font-bold">{card.power}</p>
              </div>
            )}
          </div>

          {card.rarity && (
            <div>
              <h2 className="font-semibold mb-1">Rarity</h2>
              <p className="text-gray-700 capitalize">{card.rarity}</p>
            </div>
          )}

          {card.tags && card.tags.length > 0 && (
            <div>
              <h2 className="font-semibold mb-1">Tags</h2>
              <p className="text-gray-700">{card.tags.join(', ')}</p>
            </div>
          )}

          {card.text_plain && (
            <div>
              <h2 className="font-semibold mb-1">Rules Text</h2>
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{card.text_plain}</p>
            </div>
          )}

          {card.text_flavour && (
            <div>
              <h2 className="font-semibold mb-1">Flavor Text</h2>
              <p className="text-gray-700 text-sm italic leading-relaxed">{card.text_flavour}</p>
            </div>
          )}

          <div>
            <h2 className="font-semibold mb-1">Set</h2>
            <p className="text-gray-700">
              {card.set_label} ({card.set_id})
            </p>
          </div>

          <div>
            <h2 className="font-semibold mb-1">ID</h2>
            <p className="text-gray-700 font-mono text-sm">{card.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
