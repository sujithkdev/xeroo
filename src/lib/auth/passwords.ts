import bcrypt from 'bcryptjs';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password is too long.';
  return null;
}
