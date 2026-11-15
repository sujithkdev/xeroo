/**
 * Access control helpers for API routes.
 *
 * The old isLocalOperator (network-topology) approach is replaced by
 * session-based auth. These functions work with the new DB layer.
 *
 * Backward-compat: LOCAL_DB_MODE=true keeps the original single-shop
 * localhost-only behaviour for local dev without PostgreSQL.
 */
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { hashToken } from './auth/tokens';

// ─── Agent authentication (per-shop bearer token) ─────────────────────────────

/**
 * Verify the agent's bearer token against the agents table.
 * Returns the agent row { id, shop_id } if valid, null otherwise.
 * Token is compared via hash — raw token never stored.
 */
export async function verifyAgentToken(
  request: Request | NextRequest
): Promise<{ agentId: string; shopId: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const raw = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!raw || raw.length < 32) return null;

  // Lazy import to avoid circular deps at module load
  const { queryOne } = await import('./db/client');
  const hash = hashToken(raw);
  const row = await queryOne<{ id: string; shop_id: string }>(
    `SELECT id, shop_id FROM agents
     WHERE token_hash = $1 AND is_revoked = FALSE`,
    [hash]
  );
  return row ? { agentId: row.id, shopId: row.shop_id } : null;
}

// ─── Legacy LOCAL_DB_MODE helpers (single-shop dev without PostgreSQL) ─────────

/**
 * Returns true when running in local single-shop mode.
 * Set LOCAL_DB_MODE=true in .env.local to enable.
 * Never enabled in production (DATABASE_URL must be set instead).
 */
export function isLocalMode(): boolean {
  return (
    process.env.LOCAL_DB_MODE !== 'false' && !process.env.VERCEL && process.env.LOCAL_OPERATOR_MODE !== 'false' &&
    !process.env.DATABASE_URL
  );
}

/**
 * Original localhost-only operator check — kept for LOCAL_DB_MODE only.
 * In production multi-shop mode this always returns false.
 */
export function isLocalOperator(request: Request | NextRequest): boolean {
  if (!isLocalMode()) return false;
  const host = request.headers.get('host') ?? '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return false;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded && forwarded.split(',').some(
    (ip) => !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip.trim())
  )) return false;
  if (request.headers.has('forwarded')) return false;
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== host) return false;
  return request.headers.get('sec-fetch-site') !== 'cross-site';
}

/**
 * Legacy agent check — used only in LOCAL_DB_MODE.
 * Checks AGENT_TOKEN env var directly (single-shop dev).
 */
export function isAgent(request: Request | NextRequest): boolean {
  if (!isLocalMode()) return false;
  const expected = process.env.AGENT_TOKEN ?? '';
  const actual = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!expected || expected.length < 32 || !actual) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function requireOperator(request: Request | NextRequest): void {
  if (!isLocalOperator(request)) {
    throw new Error('Local operator access required.');
  }
}

