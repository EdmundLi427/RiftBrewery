'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createDeck } from '../../actions';

export default function NewDeckPage() {
  const router = useRouter();
  const [deckName, setDeckName] = useState('Untitled Deck');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', deckName.trim() || 'Untitled Deck');

      const result = await createDeck(null, formData);

      if (result?.deckId) {
        router.push(`/dashboard/decks/${result.deckId}`);
      } else if (result?.message) {
        setError(result.message);
        setCreating(false);
      }
    } catch {
      setError('Failed to create deck');
      setCreating(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Link href="/dashboard/decks" className="text-blue-500 hover:underline mb-4 inline-block">
        ← Back to decks
      </Link>

      <h1 className="text-2xl font-bold mb-6">Create New Deck</h1>

      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded p-4">
        <label htmlFor="deckName" className="block text-sm font-medium mb-2">
          Deck Name
        </label>
        <input
          id="deckName"
          type="text"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm mb-4"
          placeholder="e.g., Aggro Mill"
          autoFocus
        />

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        <p className="text-xs text-gray-500 mb-4">
          You&apos;ll pick your legend, champion, and cards in the builder.
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={creating}
            className="bg-blue-500 text-white px-6 py-2 rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating…' : 'Create Deck'}
          </button>
          <Link
            href="/dashboard/decks"
            className="bg-gray-200 text-gray-800 px-6 py-2 rounded text-sm hover:bg-gray-300"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
