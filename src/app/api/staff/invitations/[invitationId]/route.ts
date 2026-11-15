import { NextResponse } from 'next/server';
import { getSessionWithShop } from '@/lib/auth/sessions';
import { requireOwner, AuthError } from '@/lib/auth/permissions';
import { revokeInvitation } from '@/lib/db/shops';
import { isLocalMode } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** DELETE /api/staff/invitations/[invitationId] — revoke a pending invitation. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ invitationId: string }> }
) {
  if (isLocalMode()) return NextResponse.json(
    { error: 'Staff management requires multi-shop mode.' }, { status: 409 }
  );
  try {
    const session = await getSessionWithShop(request);
    requireOwner(session);
    const shopId = session.shopId!;
    const { invitationId } = await context.params;

    await revokeInvitation(invitationId, shopId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.message : e instanceof Error ? e.message : 'Request failed' },
      { status: e instanceof AuthError ? e.status : 400 }
    );
  }
}
