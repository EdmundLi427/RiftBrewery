import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required');
const secret = process.env.JWT_SECRET;

export function signToken(payload: { userId: number }): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, secret) as { userId: number };
  } catch {
    return null;
  }
}
