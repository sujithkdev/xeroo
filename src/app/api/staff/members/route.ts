import { NextResponse } from 'next/server';
import { getSessionWithShop } from '@/lib/auth/sessions';
import { requireOwner, requireStaff, AuthError } from '@/lib/auth/permissions';
import {
  getShopMembers, getPendingInvitations, inviteStaffMember,
} from '@/lib/db/shops';
import { isLocalMode } from '@/lib/access';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => NextResponse.json(
  { error: e instanceof AuthError ? e.message : e instanceof Error ? e.message : 'Request failed' },
  { status: e instanceof AuthError ? e.status : 400 }
);

/** GET /api/staff/members — list active members + pending invitations for the shop. */
export async function GET(request: Request) {
  if (isLocalMode()) return NextResponse.json(
    { error: 'Staff management requires multi-shop mode.' }, { status: 409 }
  );
  try {
    const session = await getSessionWithShop(request);
    requireStaff(session);                          // any staff can view the list
    const shopId = session.shopId!;
    const [members, invitations] = await Promise.all([
      getShopMembers(shopId),
      getPendingInvitations(shopId),
    ]);
    return NextResponse.json({ members, invitations }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e); }
}

/** POST /api/staff/members — invite a new manager or staff member.
 *
 *  Body: { email: string, role: 'manager' | 'staff' }
 *
 *  Returns: { invitationUrl: string } — caller must deliver this link to the invitee.
 *  The raw token is only ever returned here; it is stored hashed in the DB.
 */
export async function POST(request: Request) {
  if (isLocalMode()) return NextResponse.json(
    { error: 'Staff management requires multi-shop mode.' }, { status: 409 }
  );
  try {
    const session = await getSessionWithShop(request);
    requireOwner(session);                          // only owners can invite
    const shopId = session.shopId!;

    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const role: string = String(body.role ?? '');

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (role !== 'manager' && role !== 'staff') {
      return NextResponse.json({ error: 'Role must be "manager" or "staff".' }, { status: 400 });
    }

    const token = await inviteStaffMember(shopId, email, role as 'manager' | 'staff', session.userId);

    // Build the full invitation URL.  The x-shop-id is set by middleware from the subdomain,
    // so we reconstruct the origin from the request Host header.
    const host = request.headers.get('host') ?? 'localhost:3000';
    const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const invitationUrl = `${proto}://${host}/invite/${token}`;

    return NextResponse.json({ success: true, invitationUrl });
  } catch (e) { return fail(e); }
}
