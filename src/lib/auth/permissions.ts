import type { SessionUser } from './sessions';
import { NextResponse } from 'next/server';

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function denied(msg = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export function forbidden(msg = 'Forbidden'): NextResponse {
  return NextResponse.json({ error: msg }, { status: 403 });
}

// ─── Role hierarchy ───────────────────────────────────────────────────────────
type Role = 'owner' | 'manager' | 'staff' | 'platform_admin';
const ROLE_RANK: Record<Role, number> = {
  platform_admin: 100,
  owner: 3,
  manager: 2,
  staff: 1,
};

function hasRank(session: SessionUser, required: Role): boolean {
  if (session.isPlatformAdmin) return true;
  const role = session.shopRole as Role | null;
  if (!role) return false;
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[required];
}

// ─── Permission checks ────────────────────────────────────────────────────────

/** Require any authenticated staff member of the current shop. */
export function requireStaff(session: SessionUser | null): asserts session is SessionUser {
  if (!session) throw new AuthError(401, 'Authentication required.');
  if (!session.shopId)
    throw new AuthError(403, 'No shop context.');
  if (!session.shopRole && !session.isPlatformAdmin)
    throw new AuthError(403, 'Not a member of this shop.');
}

/** Require shop manager or above. */
export function requireManager(session: SessionUser | null): asserts session is SessionUser {
  requireStaff(session);
  if (!hasRank(session, 'manager'))
    throw new AuthError(403, 'Manager or owner access required.');
}

/** Require shop owner or platform admin. */
export function requireOwner(session: SessionUser | null): asserts session is SessionUser {
  requireStaff(session);
  if (!hasRank(session, 'owner'))
    throw new AuthError(403, 'Owner access required.');
}

/** Require platform admin. */
export function requirePlatformAdmin(session: SessionUser | null): asserts session is SessionUser {
  if (!session) throw new AuthError(401, 'Authentication required.');
  if (!session.isPlatformAdmin) throw new AuthError(403, 'Platform admin access required.');
}

/** Can this user issue refunds? Owner always can; manager and staff are configurable. */
export function canRefund(session: SessionUser): boolean {
  return hasRank(session, 'manager');
}

/** Can this user change prices? */
export function canChangePrices(session: SessionUser): boolean {
  return hasRank(session, 'manager');
}

/** Can this user manage staff? */
export function canManageStaff(session: SessionUser): boolean {
  return hasRank(session, 'owner');
}

/** Can this user override prices on counter orders? */
export function canOverridePrice(session: SessionUser): boolean {
  return hasRank(session, 'owner');
}

/** Wrap a route handler with auth error handling. */
export function withAuth<T>(
  fn: () => Promise<NextResponse>
): () => Promise<NextResponse> {
  return async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }
  };
}
