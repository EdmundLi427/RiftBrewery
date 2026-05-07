import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/auth';

/**
 * Get the current user's ID, redirecting to /login if not authenticated.
 */
export async function getSessionUserId(): Promise<number> {
  const userId = await getUserId();
  if (!userId) {
    redirect('/login');
  }
  return userId;
}
