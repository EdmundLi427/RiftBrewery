'use client'

import { useCallback, useDeferredValue, useMemo, useRef, useState, useTransition } from 'react';
import { setLegend, setChampion, addCard, removeCard } from './actions';
import { DeckCardEntry, validateDeck } from '@/lib/rules';
import type { CardRow } from '@/lib/cards';
import { toCard } from '@/lib/cards';
import { formatDeckError } from '@/lib/error-messages';
import { COLORS, COLOR_LABEL } from '@/lib/colors';

interface DeckBuilderClientProps {
  deckId: string;
  initialLegend: string | null;
  initialChampion: string | null;
  initialCards: DeckCardEntry[];
  /** Full browseable card pool (~1k rows). Stable across deck loads. */
  cardPool: CardRow[];
}

type TabType = 'cards' | 'deck';

export default function DeckBuilderClient({
  deckId,
  initialLegend,
  initialChampion,
  initialCards,
  cardPool,
}: DeckBuilderClientProps) {
  const [isPending, startTransition] = useTransition();
  const [mobileTab, setMobileTab] = useState<TabType>('cards');

  // Filters
  const [cardName, setCardName] = useState('');
  // useDeferredValue lets React keep the input snappy and run the (more
  // expensive) filter + grid render at lower priority. The text field
  // updates immediately; the grid catches up when the browser is idle.
  const cardNameDeferred = useDeferredValue(cardName);
  const [cardType, setCardType] = useState('');
  const [cardEnergy, setCardEnergy] = useState<number | ''>('');
  const [selectedDomain, setSelectedDomain] = useState<Set<string>>(new Set());

  // Pagination over the filtered list. Page size matches the render cap
  // we use for perf — ~50 thumbs in the DOM is the sweet spot.
  //
  // The page state can fall "out of range" when filters narrow the result
  // set (e.g. on page 4, then a filter cuts matches to one page). Rather
  // than reset via useEffect (which causes cascading renders), the pager
  // clamps `page` to the valid range at render time.
  // 48 = 6 rows × 8 cols, fills the grid cleanly.
  const PAGE_SIZE = 48;
  const [page, setPage] = useState(1);

  // Hover preview: enlarged card image follows the cursor after a short
  // dwell. Desktop only — pointer-events: none on the preview means it
  // never blocks clicks on the underlying thumbnail.
  const [hoverCard, setHoverCard] = useState<CardRow | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const showHover = useCallback((card: CardRow, e: React.MouseEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setHoverCard(card);
      setHoverPos({ x, y });
    }, 200);
  }, []);

  const moveHover = useCallback((e: React.MouseEvent) => {
    setHoverPos({ x: e.clientX, y: e.clientY });
  }, []);

  const hideHover = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverCard(null);
    setHoverPos(null);
  }, []);

  // Deck state. Tracked locally for snappy clicks; server actions persist.
  const [legendId, setLegendId] = useState(initialLegend);
  const [championId, setChampionId] = useState(initialChampion);
  const [deckCards, setDeckCards] = useState<DeckCardEntry[]>(initialCards);

  // Pool indexed by id — used by both the rendered deck (look up image_url,
  // name) and the validator (mapped through toCard).
  const poolById = useMemo(
    () => new Map(cardPool.map((c) => [c.id, c])),
    [cardPool]
  );

  // Validator-shape index built once from the full pool. The validator only
  // needs {id, name, type, colors}; toCard() does the domain → colors rename.
  const validatorIndex = useMemo(
    () => new Map(cardPool.map((c) => [c.id, toCard(c)])),
    [cardPool]
  );

  // Filtered browse pane.
  const filteredCards = useMemo(() => {
    const needle = cardNameDeferred.toLowerCase();
    return cardPool.filter((card) => {
      if (needle && !card.name.toLowerCase().includes(needle)) return false;
      if (cardType && card.type !== cardType) return false;
      if (cardEnergy !== '' && card.energy !== cardEnergy) return false;
      if (selectedDomain.size > 0) {
        // "Exactly" match: card's domain set equals selected set.
        const cardDomainSet = new Set(card.domain);
        if (
          cardDomainSet.size !== selectedDomain.size ||
          ![...selectedDomain].every((d) => cardDomainSet.has(d))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [cardPool, cardNameDeferred, cardType, cardEnergy, selectedDomain]);

  // Clamp page to the valid range so a stale page (e.g. user was on page 5,
  // then a filter narrowed results to 1 page) doesn't strand the grid empty.
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;

  // Live validation.
  const validation = validateDeck(
    { legendCardId: legendId, championCardId: championId, cards: deckCards },
    validatorIndex
  );

  const counts = {
    champion: championId ? 1 : 0,
    main: deckCards.filter((dc) => dc.section === 'main').reduce((s, dc) => s + dc.quantity, 0),
    sideboard: deckCards.filter((dc) => dc.section === 'sideboard').reduce((s, dc) => s + dc.quantity, 0),
    battlefield: deckCards.filter((dc) => dc.section === 'battlefield').reduce((s, dc) => s + dc.quantity, 0),
    rune: deckCards.filter((dc) => dc.section === 'rune').reduce((s, dc) => s + dc.quantity, 0),
  };

  // "Total cards" = champion + main + battlefield + rune (legend is the deck
  // identity, sideboard is its own thing). A complete deck reads 55:
  //   1 champion + 39 main + 3 battlefields + 12 runes.
  const totalDeck = counts.champion + counts.main + counts.battlefield + counts.rune;

  const handleCardClick = (card: CardRow) => {
    if (card.type === 'legend') {
      startTransition(async () => {
        setLegendId(card.id);
        await setLegend(deckId, card.id);
      });
      return;
    }

    // Default section for the card's type. Champion units go to the champion
    // slot if it's empty; otherwise into main (so a user can run 1 chosen
    // champion + 2 more in deck, total 3, validator-allowed).
    const section: DeckCardEntry['section'] =
      card.type === 'champion_unit'
        ? championId
          ? 'main'
          : 'champion'
        : card.type === 'battlefield'
        ? 'battlefield'
        : card.type === 'rune'
        ? 'rune'
        : 'main';

    if (section === 'champion') {
      startTransition(async () => {
        setChampionId(card.id);
        await setChampion(deckId, card.id);
      });
      return;
    }

    startTransition(async () => {
      setDeckCards((prev) => {
        const existing = prev.find((dc) => dc.cardId === card.id && dc.section === section);
        if (existing) {
          return prev.map((dc) =>
            dc === existing ? { ...dc, quantity: dc.quantity + 1 } : dc
          );
        }
        return [...prev, { cardId: card.id, section, quantity: 1 }];
      });
      await addCard(deckId, card.id, section);
    });
  };

  const handleRemove = (cardId: string, section: 'legend' | 'champion' | DeckCardEntry['section']) => {
    if (section === 'legend' && cardId === legendId) {
      startTransition(async () => {
        setLegendId(null);
        await setLegend(deckId, null);
      });
      return;
    }
    if (section === 'champion' && cardId === championId) {
      startTransition(async () => {
        setChampionId(null);
        await setChampion(deckId, null);
      });
      return;
    }

    const concreteSection = section as DeckCardEntry['section'];
    startTransition(async () => {
      setDeckCards((prev) => {
        const entry = prev.find((dc) => dc.cardId === cardId && dc.section === concreteSection);
        if (!entry) return prev;
        if (entry.quantity > 1) {
          return prev.map((dc) => (dc === entry ? { ...dc, quantity: dc.quantity - 1 } : dc));
        }
        return prev.filter((dc) => dc !== entry);
      });
      await removeCard(deckId, cardId, concreteSection);
    });
  };

  return (
    <div className="w-full h-full flex flex-col lg:flex-row gap-6">
      {/* Mobile tabs */}
      <div className="lg:hidden flex gap-2 border-b mb-4">
        <button
          className={`px-4 py-2 font-semibold ${mobileTab === 'cards' ? 'border-b-2 border-blue-500' : ''}`}
          onClick={() => setMobileTab('cards')}
        >
          Cards
        </button>
        <button
          className={`px-4 py-2 font-semibold ${mobileTab === 'deck' ? 'border-b-2 border-blue-500' : ''}`}
          onClick={() => setMobileTab('deck')}
        >
          Deck
        </button>
      </div>

      {/* Left pane: Browse */}
      <div className={`flex-1 lg:flex-none lg:basis-2/3 lg:border-r lg:pr-6 ${mobileTab === 'cards' ? 'block' : 'hidden lg:block'}`}>
        <h2 className="text-lg font-semibold mb-4">Browse Cards</h2>

        <div className="space-y-3 mb-6">
          <input
            type="text"
            placeholder="Card name..."
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />

          <select
            value={cardType}
            onChange={(e) => setCardType(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          >
            <option value="">All Types</option>
            <option value="legend">Legend</option>
            <option value="unit">Unit</option>
            <option value="champion_unit">Champion Unit</option>
            <option value="spell">Spell</option>
            <option value="gear">Gear</option>
            <option value="battlefield">Battlefield</option>
            <option value="rune">Rune</option>
          </select>

          <input
            type="number"
            placeholder="Energy"
            value={cardEnergy}
            onChange={(e) => setCardEnergy(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 border rounded text-sm"
          />

          <div>
            <label className="text-sm font-medium block mb-2">Domain</label>
            <div className="grid grid-cols-2 gap-2">
              {COLORS.map((color) => (
                <label key={color} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedDomain.has(color)}
                    onChange={(e) => {
                      const next = new Set(selectedDomain);
                      if (e.target.checked) next.add(color);
                      else next.delete(color);
                      setSelectedDomain(next);
                    }}
                    className="rounded"
                  />
                  {COLOR_LABEL[color]}
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500">
            {filteredCards.length} {filteredCards.length === 1 ? 'card' : 'cards'} match
            {filteredCards.length !== cardPool.length && ` (of ${cardPool.length})`}
          </p>
        </div>

        <div className="grid grid-cols-8 gap-1">
          {filteredCards.slice(pageStart, pageEnd).map((card) => (
            <button
              key={card.id}
              onClick={() => handleCardClick(card)}
              onMouseEnter={(e) => showHover(card, e)}
              onMouseMove={moveHover}
              onMouseLeave={hideHover}
              disabled={isPending}
              className="relative border border-gray-300 rounded overflow-hidden hover:border-blue-400 hover:ring-1 hover:ring-blue-300 disabled:opacity-30 transition"
              title={`${card.name} — ${card.type}${card.energy !== null ? ` · ${card.energy}` : ''}`}
            >
              <div className="w-full aspect-[5/7] bg-gray-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image_url}
                  alt={card.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
            </button>
          ))}
        </div>

        {/* Pager — visible whenever there's more than one page, OR whenever
            the user is currently parked on a page that no longer exists.
            The second clause gives them an escape back to page 1 after a
            filter change narrows results below their current page. */}
        {(totalPages > 1 || page > 1) && (
          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ‹
            </button>
            <span className="text-slate-600 tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ›
            </button>
          </div>
        )}
      </div>

      {/* Right pane: Deck */}
      <div className={`flex-1 lg:flex-none lg:basis-1/3 ${mobileTab === 'deck' ? 'block' : 'hidden lg:block'}`}>
        <h2 className="text-lg font-semibold mb-2">Deck Builder</h2>

        <div className="mb-4 p-3 bg-gray-100 rounded">
          <p className="font-semibold text-sm">Total Cards: {totalDeck}</p>
        </div>

        {validation.ok ? (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
            <p className="text-sm text-green-800 font-semibold">deck is legal</p>
          </div>
        ) : (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm font-semibold text-red-800 mb-2">Issues:</p>
            <ul className="text-xs text-red-700 space-y-1">
              {validation.errors.map((err, i) => (
                <li key={i}>• {formatDeckError(err, validatorIndex)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-4">
          <DeckSection
            title="Legend"
            count={legendId ? 1 : 0}
            max={1}
            cards={legendId ? [{ cardId: legendId, quantity: 1 }] : []}
            poolById={poolById}
            onRemove={(cid) => handleRemove(cid, 'legend')}
            onHover={showHover}
            onHoverMove={moveHover}
            onHoverEnd={hideHover}
            isLoading={isPending}
          />

          <DeckSection
            title="Chosen Champion"
            count={counts.champion}
            max={1}
            cards={championId ? [{ cardId: championId, quantity: 1 }] : []}
            poolById={poolById}
            onRemove={(cid) => handleRemove(cid, 'champion')}
            onHover={showHover}
            onHoverMove={moveHover}
            onHoverEnd={hideHover}
            isLoading={isPending}
          />

          <DeckSection
            title="Battlefields"
            count={counts.battlefield}
            max={3}
            cards={deckCards.filter((dc) => dc.section === 'battlefield')}
            poolById={poolById}
            onRemove={(cid) => handleRemove(cid, 'battlefield')}
            onHover={showHover}
            onHoverMove={moveHover}
            onHoverEnd={hideHover}
            isLoading={isPending}
          />

          <DeckSection
            title="Deck"
            count={counts.main}
            max={39}
            cards={deckCards.filter((dc) => dc.section === 'main')}
            poolById={poolById}
            onRemove={(cid) => handleRemove(cid, 'main')}
            onHover={showHover}
            onHoverMove={moveHover}
            onHoverEnd={hideHover}
            isLoading={isPending}
          />

          <DeckSection
            title="Runes"
            count={counts.rune}
            max={12}
            cards={deckCards.filter((dc) => dc.section === 'rune')}
            poolById={poolById}
            onRemove={(cid) => handleRemove(cid, 'rune')}
            onHover={showHover}
            onHoverMove={moveHover}
            onHoverEnd={hideHover}
            isLoading={isPending}
          />

          <DeckSection
            title="Sideboard"
            count={counts.sideboard}
            max={8}
            cards={deckCards.filter((dc) => dc.section === 'sideboard')}
            poolById={poolById}
            onRemove={(cid) => handleRemove(cid, 'sideboard')}
            onHover={showHover}
            onHoverMove={moveHover}
            onHoverEnd={hideHover}
            isLoading={isPending}
          />
        </div>
      </div>
    </div>
  );
}

interface DeckSectionProps {
  title: string;
  count: number;
  max: number;
  cards: Array<{ cardId: string; quantity: number }>;
  poolById: Map<string, CardRow>;
  onRemove: (cardId: string) => void;
  onHover: (card: CardRow, e: React.MouseEvent) => void;
  onHoverMove: (e: React.MouseEvent) => void;
  onHoverEnd: () => void;
  isLoading: boolean;
}

function DeckSection({
  title,
  count,
  max,
  cards,
  poolById,
  onRemove,
  onHover,
  onHoverMove,
  onHoverEnd,
  isLoading,
}: DeckSectionProps) {
  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{title}</h3>
        <div
          className={`text-xs px-2 py-1 rounded font-semibold ${
            count === max ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {count}/{max}
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="text-xs text-gray-500 py-1">Empty</p>
      ) : (
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(45px, 1fr))' }}
        >
          {cards.map((entry) => {
            const card = poolById.get(entry.cardId);
            return (
              <div
                key={entry.cardId}
                className="relative border border-gray-300 rounded overflow-hidden group"
                title={card?.name || entry.cardId}
                onMouseEnter={card ? (e) => onHover(card, e) : undefined}
                onMouseMove={card ? onHoverMove : undefined}
                onMouseLeave={card ? onHoverEnd : undefined}
              >
                <div className="w-full aspect-[5/7] bg-gray-100">
                  {card?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">?</div>
                  )}
                </div>

                {entry.quantity > 1 && (
                  <div className="absolute top-0.5 right-0.5 bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs font-bold">
                    {entry.quantity}
                  </div>
                )}

                <button
                  onClick={() => onRemove(entry.cardId)}
                  disabled={isLoading}
                  className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 flex items-center justify-center opacity-0 group-hover:opacity-100 disabled:opacity-50 transition text-white font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
