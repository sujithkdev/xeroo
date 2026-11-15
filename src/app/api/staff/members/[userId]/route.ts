import { NextResponse } from 'next/server';
import { getSessionWithShop } from '@/lib/auth/sessions';
import { requireOwner, AuthError } from '@/lib/auth/permissions';
import { updateMemberRole, removeMember } from '@/lib/db/shops';
import { isLocalMode } from '@/lib/access';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => NextResponse.json(
  { error: e instanceof AuthError ? e.message : e instanceof Error ? e.message : 'Request failed' },
  { status: e instanceof AuthError ? e.status : 400 }
);

/** PATCH /api/staff/members/[userId] — change a member's role.
 *  Body: { role: 'manager' | 'staff' }
 *  Cannot change an owner's role.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  if (isLocalMode()) return NextResponse.json(
    { error: 'Staff management requires multi-shop mode.' }, { status: 409 }
  );
  try {
    const session = await getSessionWithShop(request);
    requireOwner(session);
    const shopId = session.shopId!;
    const { userId } = await context.params;

    if (userId === session.userId) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 });
    }

    const body = await request.json();
    const role: string = String(body.role ?? '');
    if (role !== 'manager' && role !== 'staff') {
      return NextResponse.json({ error: 'Role must be "manager" or "staff".' }, { status: 400 });
    }

    await updateMemberRole(shopId, userId, role as 'manager' | 'staff');
    return NextResponse.json({ success: true });
  } catch (e) { return fail(e); }
}

/** DELETE /api/staff/members/[userId] — remove a member from the shop.
 *  Cannot remove an owner or yourself.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  if (isLocalMode()) return NextResponse.json(
    { error: 'Staff management requires multi-shop mode.' }, { status: 409 }
  );
  try {
    const session = await getSessionWithShop(request);
    requireOwner(session);
    const shopId = session.shopId!;
    const { userId } = await context.params;

    if (userId === session.userId) {
      return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 400 });
    }

    await removeMember(shopId, userId);
    return NextResponse.json({ success: true });
  } catch (e) { return fail(e); }
}
