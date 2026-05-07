import Link from 'next/link';
import { browseCards } from './actions';
import { getCardIndex } from '@/lib/cards.server';

const CARD_TYPES = ['unit', 'spell', 'gear', 'legend', 'battlefield', 'rune', 'champion_unit'];

export default async function BrowseCardsPage(props: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const searchParams = await props.searchParams;

  const page = parseInt((searchParams.page as string) || '1', 10);
  const name = (searchParams.name as string) || '';
  const type = (searchParams.type as string) || '';
  const energy = searchParams.energy ? parseInt(searchParams.energy as string, 10) : undefined;
  const domain = Array.isArray(searchParams.domain)
    ? searchParams.domain.map(d => d.toLowerCase())
    : searchParams.domain
      ? [searchParams.domain.toLowerCase()]
      : [];

  const { cards, totalPages } = await browseCards({
    name,
    type,
    energy,
    domain: domain.length > 0 ? domain : undefined,
    page,
  });

  // Load filter options from card_indexes
  const domainOptions = await getCardIndex('domains');

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold mb-4">Browse Cards</h1>

      {/* Filter Form */}
      <form method="get" className="mb-6 p-4 bg-gray-50 rounded">
        <div className="grid gap-4">
          {/* Name filter */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              Card Name
            </label>
            <input
              id="name"
              type="text"
              name="name"
              defaultValue={name}
              placeholder="Search..."
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>

          {/* Type filter */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium mb-1">
              Type
            </label>
            <select
              id="type"
              name="type"
              defaultValue={type}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="">All Types</option>
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Energy filter */}
          <div>
            <label htmlFor="energy" className="block text-sm font-medium mb-1">
              Energy Cost
            </label>
            <select
              id="energy"
              name="energy"
              defaultValue={energy?.toString() || ''}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="">All Costs</option>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Domain filters */}
          <div>
            <label className="block text-sm font-medium mb-2">Domain</label>
            <div className="grid grid-cols-2 gap-2">
              {domainOptions.map((d) => (
                <label key={d} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="domain"
                    value={d.toLowerCase()}
                    defaultChecked={domain.includes(d.toLowerCase())}
                    className="rounded"
                  />
                  <span className="text-sm">{d}</span>
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600">
            Filter
          </button>
        </div>
      </form>

      {/* Card Grid */}
      {cards.length === 0 ? (
        <p className="text-gray-500">No cards found.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            {cards.map((card) => (
              <Link
                key={card.id}
                href={`/dashboard/cards/${card.id}`}
                className="bg-white border border-gray-200 rounded overflow-hidden hover:shadow-lg transition"
              >
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {card.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs text-center p-2">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-2 border-t border-gray-200">
                  <p className="text-xs font-semibold line-clamp-2">{card.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{card.type}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex gap-2 justify-center">
            {page > 1 && (
              <Link
                href={`/dashboard/cards?page=${page - 1}${name ? `&name=${encodeURIComponent(name)}` : ''}${type ? `&type=${encodeURIComponent(type)}` : ''}`}
                className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100"
              >
                Prev
              </Link>
            )}
            <span className="px-3 py-1 text-sm">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/dashboard/cards?page=${page + 1}${name ? `&name=${encodeURIComponent(name)}` : ''}${type ? `&type=${encodeURIComponent(type)}` : ''}`}
                className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100"
              >
                Next
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
