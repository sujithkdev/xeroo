import { canRequestRefund } from '@/lib/refunds';
import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { db } from '@/lib/db';
import { isLocalOperator, isLocalMode } from '@/lib/access';
import { getSessionWithShop } from '@/lib/auth/sessions';
import { requireManager, AuthError } from '@/lib/auth/permissions';
import { checkoutTransaction } from '@/lib/checkout-store';
import { paymentConfig } from '@/lib/payment-context';

export async function POST(request: Request) {
  // Auth: local single-shop mode uses IP-based operator check;
  // multi-shop production uses session-based manager auth.
  let shopId: string | null = null;
  try {
    if (isLocalMode()) {
      if (!isLocalOperator(request)) throw new AuthError(401, 'Unauthorized');
    } else {
      const session = await getSessionWithShop(request);
      requireManager(session);
      shopId = session.shopId!;
      const headerShop = request.headers.get('x-shop-id');
      if (headerShop && headerShop !== shopId) throw new AuthError(403, 'Wrong shop.');
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof AuthError ? e.message : 'Unauthorized' },
      { status: e instanceof AuthError ? e.status : 401 }
    );
  }

  let id: string | undefined;
  let reserved = false;
  try {
    const body = await request.json();
    id = body.id;

    // For multi-shop mode, mutate via checkoutTransaction so the order is
    // scoped to the authenticated shop. Local mode uses db.mutateOrder directly.
    const mutate = async (fn: (o: any) => any): Promise<any> => {
      if (isLocalMode()) return db.mutateOrder(id!, fn);
      return checkoutTransaction(shopId, async (s) => {
        const o = s.orders.find((x: any) => x.id === id);
        if (!o) throw new Error('Order not found.');
        const updated = fn(o);
        Object.assign(o, updated);
        return o;
      });
    };

    const order = await mutate((o) => {
      if (!canRequestRefund(o)) throw new Error('Cancel the unprinted order or review the failed/completed job before refunding. A previous refund must be reconciled before retrying.');
      if (o.paymentMethod === 'cash' && body.cashReturned !== true) throw new Error('Confirm cash was returned to the customer.');
      return { ...o, refundState: 'pending', refundReason: String(body.reason || 'Operator refund').trim().slice(0, 500) };
    });
    reserved = true;

    let refundId = 'cash-return:' + order.id;
    let state: 'pending' | 'processed' = 'processed';

    if (order.paymentMethod !== 'cash') {
      // paymentConfig handles both local (SQLite) and multi-shop (Postgres) transparently.
      const config = await paymentConfig(shopId);
      const client = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
      const refund = await client.payments.refund(order.paymentId!, {
        amount: Math.round(order.amount * 100),
        receipt: order.id.slice(0, 40),
      });
      refundId = refund.id;
      state = refund.status === 'processed' ? 'processed' : 'pending';
    }

    await mutate((o: any) => ({
      ...o,
      refundedAt: o.refundedAt ?? (state === 'processed' ? new Date().toISOString() : undefined),
      refundId,
      refundState: o.refundState === 'processed' ? 'processed' : state,
      status: 'cancelled',
    }));

    return NextResponse.json({ success: true, refundId, state });
  } catch (error) {
    if (reserved && id) {
      // Best-effort: mark for manual review so the order isn't stuck in 'pending'.
      try {
        if (isLocalMode()) await db.mutateOrder(id, (o) => ({ ...o, refundState: 'needs_review' }));
        else await checkoutTransaction(shopId, async (s) => {
          const o = s.orders.find((x: any) => x.id === id);
          if (o) o.refundState = 'needs_review';
        });
      } catch { /* non-fatal */ }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Refund failed' },
      { status: error instanceof AuthError ? error.status : 409 }
    );
  }
}
