'use client'

import { useState } from 'react';
import { createMatchup } from '../[id]/actions';

interface Deck {
  id: string;
  name: string;
}

export default function NewMatchupClient({ decks }: { decks: Deck[] }) {
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!selectedA || !selectedB || selectedA === selectedB) {
      setError('Select two different decks');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await createMatchup(selectedA, selectedB);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Deck A Picker */}
      <div>
        <label className="block text-sm font-semibold mb-2">Deck A</label>
        <div className="space-y-2">
          {decks.map((deck) => (
            <button
              key={deck.id}
              onClick={() => setSelectedA(deck.id)}
              disabled={deck.id === selectedB}
              className={`block w-full p-3 rounded-lg border-2 text-left transition ${
                selectedA === deck.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${deck.id === selectedB ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <p className="font-semibold text-sm">{deck.name}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Deck B Picker */}
      <div>
        <label className="block text-sm font-semibold mb-2">Deck B</label>
        <div className="space-y-2">
          {decks.map((deck) => (
            <button
              key={deck.id}
              onClick={() => setSelectedB(deck.id)}
              disabled={deck.id === selectedA}
              className={`block w-full p-3 rounded-lg border-2 text-left transition ${
                selectedB === deck.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${deck.id === selectedA ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <p className="font-semibold text-sm">{deck.name}</p>
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}

      <button
        onClick={handleCompare}
        disabled={!selectedA || !selectedB || selectedA === selectedB || isLoading}
        className="w-full bg-blue-500 text-white py-2 rounded font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {isLoading ? 'Comparing...' : 'Compare'}
      </button>
    </div>
  );
}
