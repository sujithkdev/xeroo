import { query, queryOne } from '@/lib/db/client';
import { generateToken, hashToken } from './tokens';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = '__print_session';
export const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  isSuspended: boolean;
  /** Active shop membership for this session (null = platform admin, no shop context) */
  shopId: string | null;
  sessionShopId?: string | null;
  shopRole: 'owner' | 'manager' | 'staff' | null;
}

/** Create a new session. Returns the raw token (send to client), never stored raw. */
export async function createSession(
  userId: string,
  shopId: string | null,
  meta: { ip?: string; userAgent?: string } = {}
): Promise<string> {
  const raw = generateToken(32);
  const hash = hashToken(raw);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent, shop_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, hash, expires.toISOString(), meta.ip ?? null, meta.userAgent ?? null, shopId]
  );
  return raw;
}

/** Validate a raw token. Returns resolved user+shop context or null. */
export async function validateSession(rawToken: string): Promise<SessionUser | null> {
  if (!rawToken || rawToken.length < 32 || rawToken.length > 128) return null;
  const hash = hashToken(rawToken);
  const row = await queryOne<{
    user_id: string; shop_id: string | null; expires_at: Date; revoked_at: Date | null;
  }>(
    `SELECT user_id, shop_id, expires_at, revoked_at FROM sessions
     WHERE token_hash = $1`,
    [hash]
  );
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  const user = await queryOne<{
    id: string; email: string; name: string;
    is_platform_admin: boolean; is_suspended: boolean;
  }>('SELECT * FROM users WHERE id = $1', [row.user_id]);
  if (!user || user.is_suspended) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.is_platform_admin,
    isSuspended: user.is_suspended,
    shopId: null,
    sessionShopId: row.shop_id,
    shopRole: null,
  };
}

/** Resolve session + shop membership from a request. */
export async function getSessionFromRequest(
  req: NextRequest | Request
): Promise<SessionUser | null> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const raw = parseCookie(cookieHeader, SESSION_COOKIE);
  if (!raw) return null;
  return validateSession(raw);
}

/** Resolve session + shop membership (shop_id comes from x-shop-id header set by middleware). */
export async function getSessionWithShop(
  req: NextRequest | Request
): Promise<SessionUser | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return null;
  // Middleware attaches x-shop-id resolved from subdomain
  const shopId = (req as any).headers?.get?.('x-shop-id') ?? null;
  if (session.sessionShopId !== shopId) return null;
  if (!shopId) return session;
  // Verify membership
  const membership = await queryOne<{ role: string }>(
    `SELECT role FROM shop_memberships
     WHERE user_id = $1 AND shop_id = $2 AND joined_at IS NOT NULL`,
    [session.userId, shopId]
  );
  if (!membership && !session.isPlatformAdmin) return null;
  return {
    ...session,
    shopId,
    shopRole: (membership?.role as SessionUser['shopRole']) ?? null,
  };
}

/** Revoke a session by raw token. */
export async function revokeSession(rawToken: string): Promise<void> {
  const hash = hashToken(rawToken);
  await query(
    'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1',
    [hash]
  );
}

/** Revoke all sessions for a user (e.g., after password reset). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k?.trim() === name) { try { return decodeURIComponent(v.join('=')); } catch { return null; } }
  }
  return null;
}

/** Build a Set-Cookie header value for the session token. */
export function buildSessionCookie(token: string, maxAgeDays = SESSION_TTL_DAYS): string {
  const maxAge = maxAgeDays * 86_400;
  const sameSite = 'Lax';
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${maxAge}${secure}`;
}

/** Build a cookie that clears the session. */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

