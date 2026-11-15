import crypto from 'crypto';

/** Generates a cryptographically random URL-safe token string. */
export function generateToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/** SHA-256 hash of a token for storage. Never store the raw token. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Generate a tracking token for customer order tracking links. */
export function generateTrackingToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64-char private token
}

/** Generate a pickup code (short, human-readable). */
export function generatePickupCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
}

/** Generate a per-shop agent token (long, stored hashed). */
export function generateAgentToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64-char hex
}

/** Constant-time string comparison to prevent timing attacks. */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
