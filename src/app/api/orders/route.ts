import {staffFulfilment} from '@/lib/fulfilment';
import {checkoutTransaction,fromStoredOrder} from '@/lib/checkout-store';
import {customerOrder,updateCheckoutOrder} from '@/lib/checkout-service';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSessionWithShop } from '@/lib/auth/sessions';
import { requireStaff, AuthError } from '@/lib/auth/permissions';
import { verifyAgentToken, isLocalOperator, isAgent } from '@/lib/access';
import {
  getOrdersByShop, getOrderById, getOrderByTrackingToken,
  mutateOrder, appendOrderEvent, validateTransition,
} from '@/lib/db/orders';
import { db as legacyDb } from '@/lib/db';  // LOCAL_DB_MODE fallback
import { isLocalMode } from '@/lib/access';

export const dynamic = 'force-dynamic';

const denied = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL_DB_MODE: delegate entirely to the original single-shop logic
// ─────────────────────────────────────────────────────────────────────────────
async function handleLocalGet(request: Request) {
  const operator = isLocalOperator(request);
  const agentMode = isAgent(request);
  const query = new URL(request.url).searchParams;
  const orders = await legacyDb.getOrders();
  if (query.has('token')) {
    const token = query.get('token');
    const o = token ? orders.find(o => o.trackingToken === token) : undefined;
    if(o?.quoteId)return NextResponse.json({orders:[customerOrder(o)]},{headers:{'Cache-Control':'no-store'}});
    return NextResponse.json({ orders: o ? [{
      id: o.id, trackingToken: o.trackingToken, fileName: o.fileName,
      status: o.status === 'completed' ? 'ready' : o.status,
      pages: o.pages, copies: o.copies, amount: o.amount, isPaid: o.isPaid,
      colorMode: o.colorMode, paperSize: o.paperSize, duplex: o.duplex,
      paymentMethod: o.paymentMethod, refundState: o.refundState,
      collectionStatus: o.collectionStatus, createdAt: o.createdAt,
      pickupCode: ['ready', 'completed'].includes(o.status) ? o.pickupCode : undefined,
    }] : [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (agentMode) {
    await legacyDb.updateAgentPing();
    const printable = (await legacyDb.getAutoPrintEnabled())
      ? orders.filter((o) => o.isPaid && !o.refundState && ['paid', 'queued'].includes(o.status))
      : [];
    return NextResponse.json({ orders: printable });
  }
  if (operator) {
    // ?since=<ISO> — return only orders updated at or after that timestamp.
    // The client uses this for incremental polling so it doesn't download the
    // full order list every 6 seconds.
    const sinceParam = query.get('since');
    const sinceMs = sinceParam ? Date.parse(sinceParam) : NaN;
    const filtered = !isNaN(sinceMs)
      ? orders.filter(o => Date.parse(o.updatedAt || o.createdAt) >= sinceMs)
      : orders;
    return NextResponse.json({ orders: filtered }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const id = query.get('id'); const pickup = query.get('pickup');
  if (!id || !pickup) return denied();
  const order = orders.find((o) => o.id === id && o.pickupCode === pickup);
  if (!order) return NextResponse.json({ orders: [] });
  return NextResponse.json({
    orders: [{ id: order.id, fileName: order.fileName, status: order.status,
      pages: order.pages, copies: order.copies, amount: order.amount, isPaid: order.isPaid }],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — list orders (staff) or single order (customer via tracking token)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    if (isLocalMode()) return handleLocalGet(request);

    // Agent heartbeat path
    const agent = await verifyAgentToken(request);
    if (agent) {
      if (agent.shopId !== request.headers.get('x-shop-id')) return NextResponse.json({error:'Agent/shop mismatch'},{status:403});
      const orders = await getOrdersByShop(agent.shopId);
      const printable = orders.filter(
        (o) => o.payment_status === 'paid' &&
          ['accepted', 'queued'].includes(o.order_status)
      );
      return NextResponse.json({ orders: printable.map(toClientOrder) });
    }

    const params = new URL(request.url).searchParams;
    const trackingToken = params.get('token');

    // Customer: public tracking by private token
    if (trackingToken) {
      const order = await getOrderByTrackingToken(trackingToken, request.headers.get('x-shop-id') || '');
      if (!order) return NextResponse.json({ orders: [] });
      if((order as any).checkout_payload)return NextResponse.json({orders:[customerOrder(fromStoredOrder(order))]});
      return NextResponse.json({
        orders: [{
          id: order.id,
          trackingToken: order.tracking_token,
          status: order.order_status,
          paymentStatus: order.payment_status,
          collectionStatus: order.collection_status,
          amount: order.amount_paise / 100,
          isPaid: order.payment_status === 'paid',
          pickupCode: order.collection_status === 'ready' ? order.pickup_code : undefined,
          requestedPickupAt: order.requested_pickup_at,
          confirmedPickupAt: order.confirmed_pickup_at,
        }],
      });
    }

    // Staff: authenticated
    const session = await getSessionWithShop(request);
    requireStaff(session);
    const orders = await getOrdersByShop(session!.shopId!);
    return NextResponse.json({ orders: orders.map(toClientOrder) });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[GET /api/orders]', e);
    return NextResponse.json({ error: 'Could not read orders' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — create order (public — customer or counter staff)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if(body.source==='counter'||!isLocalMode())return NextResponse.json({error:'Use the checkout flow to reserve pickup capacity before placing an order.'},{status:409});

    const { createPrintOrder: legacyCreate } = await import('@/lib/order-service-local');
    const order = await legacyCreate(body);
    return NextResponse.json({ success: true, order, paymentLinkUrl: '/track/' + (order as any).trackingToken });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid order' },
      { status: 400 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — update order status (staff only)
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  try {
    if (isLocalMode()) {
      if (!isLocalOperator(request)) return denied();
      const body = await request.json();
      if((await legacyDb.getOrders()).find(o=>o.id===body.id)?.quoteId)return NextResponse.json({success:true,order:await updateCheckoutOrder(null,body.id,body)});
      const { db: ldb } = await import('@/lib/db');
      const order = await ldb.mutateOrder(body.id, (o: any) => {
        if (o.refundState) throw new Error('Refunded orders cannot be changed.');
        if(body.status==='ready'||body.status==='collected')return staffFulfilment(o,{...body,action:body.status==='ready'?'ready':'collect'},'local-operator');
        if(o.status==='error'&&body.status==='queued')throw Error('Use inspected print recovery before requeueing.');
        if (body.pages !== undefined || body.copies !== undefined || body.amount !== undefined || body.fileUrl !== undefined) throw new Error('Create a new order to change print settings.');
        if (body.status) {
          const allowed: Record<string, string[]> = {
            waiting_cash: ['paid', 'queued', 'cancelled'],
            pending: ['cancelled'], waiting_approval: ['queued', 'cancelled'],
            paid: ['queued', 'cancelled'], queued: ['cancelled'],
            downloading: ['error'], printing: ['error'],
            submitted: ['ready', 'error'], completed: ['collected'],
            ready: ['collected'], collected: [],
            error: ['queued', 'cancelled'], failed: ['cancelled'],
            cancel_requested: ['error'],
          };
          if (body.status !== o.status && !allowed[o.status]?.includes(body.status)) {
            throw new Error('Invalid status transition.');
          }
          if (['paid', 'queued'].includes(body.status) && !o.isPaid) {
            if (o.paymentMethod !== 'cash' || o.status !== 'waiting_cash') {
              throw new Error('Online payment must be verified first.');
            }
            o.isPaid = true; o.paidAt = new Date().toISOString(); o.paymentId = 'cash:' + o.id;
          }
          if (body.status === 'collected' && (!o.isPaid || body.pickupCode !== o.pickupCode)) {
            throw new Error('Verify payment and enter the customer pickup code.');
          }
          if (body.status === 'ready') o.collectionStatus = 'ready';
          if (body.status === 'collected') o.collectionStatus = 'collected';
          if (body.status !== o.status) o.activityLog = [...(o.activityLog || []), { id: crypto.randomUUID(), orderId: o.id, actor: 'Local operator', action: `Marked ${body.status}`, timestamp: new Date().toISOString() }];
          o.status = body.status;
          if (body.status === 'queued') { o.claimToken = undefined; o.claimedBy = undefined; }
        }
        if (body.assignedPrinterId !== undefined) o.assignedPrinterId = String(body.assignedPrinterId);
        if (body.staffNotes !== undefined) o.staffNotes = String(body.staffNotes).slice(0,2000);
        return o;
      });
      return NextResponse.json({ success: true, order });
    }

    const session = await getSessionWithShop(request);
    requireStaff(session);
    const shopId = session!.shopId!;
    const body = await request.json();
    const { id, status, assignedPrinterId, staffNotes, note } = body;
    const existing=await getOrderById(shopId,id);
    if((existing as any)?.checkout_payload)return NextResponse.json({success:true,order:await updateCheckoutOrder(shopId,id,body)});
    return NextResponse.json({error:'Legacy multi-shop order updates are unavailable.'},{status:409});
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Update failed' },
      { status: 409 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — staff only, limited to unpaid cancelled/failed orders
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    if (isLocalMode()) {
      if (!isLocalOperator(request)) return denied();
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
      const { db: ldb } = await import('@/lib/db');
      await ldb.mutateOrder(id, (o: any) => {
        if (!['cancelled', 'failed'].includes(o.status) || o.isPaid)
          throw new Error('Only unpaid cancelled/failed orders can be deleted.');
        return o;
      });
      await ldb.deleteOrder(id);
      return NextResponse.json({ success: true });
    }

    const session = await getSessionWithShop(request);
    requireStaff(session);
    const shopId = session!.shopId!;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    await mutateOrder(shopId, id, async (o) => {
      if (!['cancelled', 'failed'].includes(o.order_status) || o.payment_status === 'paid') {
        throw new Error('Only unpaid cancelled/failed orders can be deleted.');
      }
      return {};
    });
    await import('@/lib/db/client').then(({ query }) =>
      query('DELETE FROM orders WHERE id = $1 AND shop_id = $2', [id, shopId])
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 409 }
    );
  }
}

// ─── Shape converter ──────────────────────────────────────────────────────────
function toClientOrder(o: any) {
  if(o.checkout_payload)return fromStoredOrder(o);
  return {
    // New canonical fields
    id: o.id,
    shopId: o.shop_id,
    trackingToken: o.tracking_token,
    pickupCode: o.pickup_code,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    customerEmail: o.customer_email,
    customerInstructions: o.customer_instructions,
    staffNotes: o.staff_notes,
    source: o.source,
    paymentMethod: o.payment_method,
    amountPaise: o.amount_paise,
    discountPaise: o.discount_paise,
    couponCode: o.coupon_code,
    orderStatus: o.order_status,
    paymentStatus: o.payment_status,
    collectionStatus: o.collection_status,
    requestedPickupAt: o.requested_pickup_at,
    confirmedPickupAt: o.confirmed_pickup_at,
    // Legacy-compatible fields for existing UI
    amount: (o.amount_paise ?? 0) / 100,
    status: o.order_status ?? o.status,
    isPaid: o.payment_status === 'paid' || o.isPaid,
    paymentId: o.payment_id,
    razorpayOrderId: o.razorpay_order_id,
    refundState: o.refund_state,
    assignedPrinterId: o.assigned_printer_id,
    claimToken: o.claim_token,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    // Single-doc compat
    fileName: o.file_name ?? o.fileName,
    pages: o.pages,
    copies: o.copies,
    colorMode: o.color_mode ?? o.colorMode,
    paperSize: o.paper_size ?? o.paperSize,
    duplex: o.duplex,
  };
}

