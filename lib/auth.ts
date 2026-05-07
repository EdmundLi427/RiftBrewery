import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';

export async function getUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) return null;

  const payload = verifyToken(token);
  return payload?.userId ?? null;
}
