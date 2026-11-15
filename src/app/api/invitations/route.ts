import { queryOne } from '@/lib/db/client';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { invitationInfo, acceptStaffInvite } from '@/lib/onboarding';
import { isLocalMode } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** GET /api/invitations?token=<hex> — validate an invitation and return its metadata. */
export async function GET(r: Request) {
  try {
    const shop = r.headers.get('x-shop-id');
    if (isLocalMode() || !shop) throw Error("Invitations require the shop's multi-shop address.");
    const token = new URL(r.url).searchParams.get('token') || '';
    const info = await invitationInfo(token, shop);
    return NextResponse.json(info, {
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid invitation' }, { status: 400 });
  }
}

/** POST /api/invitations — accept an invitation (owner, manager, or staff).
 *
 *  Body: { token: string, name?: string, password: string }
 *
 *  - New users: name + password are required.
 *  - Existing users: password is used to verify account ownership; name is ignored.
 */
export async function POST(r: Request) {
  try {
    const shop = r.headers.get('x-shop-id');
    if (isLocalMode() || !shop) throw Error("Invitations require the shop's multi-shop address.");
    const b = await r.json();
    if (typeof b.token !== 'string' || !/^[a-f0-9]{64}$/.test(b.token) || typeof b.password !== 'string') {
      throw Error('Invalid invitation or password.');
    }
    // Rate limit: 10 attempts per 15 minutes per token
    const key = crypto.createHash('sha256').update('invite:' + b.token).digest('hex');
    const limit = await queryOne<{ attempts: number }>(
      `INSERT INTO login_limits(key,attempts,window_start) VALUES($1,1,now())
       ON CONFLICT(key) DO UPDATE SET
         attempts = CASE WHEN login_limits.window_start < now()-interval '15 minutes'
                         THEN 1 ELSE login_limits.attempts+1 END,
         window_start = CASE WHEN login_limits.window_start < now()-interval '15 minutes'
                              THEN now() ELSE login_limits.window_start END
       RETURNING attempts`,
      [key]
    );
    if (!limit || limit.attempts > 10) {
      return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
    }
    // acceptStaffInvite handles owner, manager, and staff paths.
    const result = await acceptStaffInvite(b.token, shop, b);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not accept invitation' },
      { status: 409 }
    );
  }
}
