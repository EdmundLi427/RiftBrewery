import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/auth';

export default async function PublicDecksPage() {
  const userId = await getUserId();
  if (!userId) redirect('/login');

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Public Decks</h1>
    </main>
  );
}
