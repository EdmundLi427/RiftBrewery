'use server'

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import bcrypt from 'bcrypt';
import sql from '@/lib/db';
import { signToken } from '@/lib/jwt';

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/;

export type CreateAccountState = { message: string } | null;

export async function createAccount(
  _prevState: CreateAccountState,
  formData: FormData
): Promise<CreateAccountState> {
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const password = (formData.get('password') as string | null) ?? '';
  const confirmPassword = (formData.get('confirmPassword') as string | null) ?? '';

  if (!email || !password || !confirmPassword) {
    return { message: 'All fields are required.' };
  }

  if (!PASSWORD_REGEX.test(password)) {
    return {
      message:
        'Password must be at least 8 characters and include a letter, number, and special character (!@#$%^&*).',
    };
  }

  if (password !== confirmPassword) {
    return { message: 'Passwords do not match.' };
  }

  const hash = await bcrypt.hash(password, 10);

  let userId: number;
  try {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO users (email, password)
      VALUES (${email}, ${hash})
      RETURNING id
    `;
    userId = row.id;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505') {
      return { message: 'An account with that email already exists.' };
    }
    console.error('Signup failed', err);
    return { message: 'Something went wrong. Please try again.' };
  }

  // Auto-login: sign a JWT and set the session cookie.
  const token = signToken({ userId });
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
