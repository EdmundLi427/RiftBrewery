'use server'

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import bcrypt from 'bcrypt';
import sql from '@/lib/db';
import { signToken } from '@/lib/jwt';

export type AuthenticateState = { message: string } | null;

export async function authenticate(
  _prevState: AuthenticateState,
  formData: FormData
): Promise<AuthenticateState> {
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const password = (formData.get('password') as string | null) ?? '';

  if (!email || !password) {
    return { message: 'Invalid email or password' };
  }

  const [user] = await sql<{ id: number; password: string }[]>`
    SELECT id, password FROM users WHERE email = ${email} LIMIT 1
  `;

  if (!user) {
    return { message: 'Invalid email or password' };
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    return { message: 'Invalid email or password' };
  }

  const token = signToken({ userId: user.id });
  const cookieStore = await cookies();
  cookieStore.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect('/dashboard');
}


