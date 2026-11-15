import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from './client';

export interface OrderRow {
  id: string;
  shop_id: string;
  tracking_token: string;
  pickup_code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_instructions: string | null;
  staff_notes: string | null;
  source: 'web' | 'counter' | 'whatsapp';
  payment_method: 'online' | 'cash';
  amount_paise: number;
  discount_paise: number;
  coupon_code: string | null;
  order_status: string;
  payment_status: string;
  collection_status: string;
  requested_pickup_at: Date | null;
  confirmed_pickup_at: Date | null;
  ready_at: Date | null;
  collected_at: Date | null;
  razorpay_order_id: string | null;
  payment_id: string | null;
  refund_id: string | null;
  refund_state: 'pending' | 'processed' | 'needs_review' | null;
  assigned_printer_id: string | null;
  claim_token: string | null;
  claimed_by_agent_id: string | null;
  created_by_staff_id: string | null;
  price_override_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  shop_id: string;
  document_id: string;
  file_name: string;
  pages: number;
  page_range: string | null;
  copies: number;
  color_mode: 'bw' | 'color';
  paper_size: string;
  duplex: 'simplex' | 'duplex';
  finishing: string;
  item_paise: number;
  sort_order: number;
}

/** Get all orders for a shop — staff-facing. */
export async function getOrdersByShop(shopId: string): Promise<OrderRow[]> {
  return query<OrderRow>(
    'SELECT * FROM orders WHERE shop_id = $1 ORDER BY created_at DESC',
    [shopId]
  );
}

/** Get a single order, enforcing shop isolation. Returns null if not found or wrong shop. */
export async function getOrderById(shopId: string, orderId: string): Promise<OrderRow | null> {
  return queryOne<OrderRow>(
    'SELECT * FROM orders WHERE id = $1 AND shop_id = $2',
    [orderId, shopId]
  );
}

/** Get order by tracking token (customer-facing — no shop_id needed, token is secret). */
export async function getOrderByTrackingToken(token: string, shopId: string): Promise<OrderRow | null> {
  return queryOne<OrderRow>(
    'SELECT * FROM orders WHERE tracking_token = $1 AND shop_id = $2',
    [token, shopId]
  );
}

/** Get order items for an order, enforcing shop isolation. */
export async function getOrderItems(shopId: string, orderId: string): Promise<OrderItemRow[]> {
  return query<OrderItemRow>(
    'SELECT * FROM order_items WHERE order_id = $1 AND shop_id = $2 ORDER BY sort_order',
    [orderId, shopId]
  );
}

/** Insert a new order + items in a single transaction. */
export async function createOrder(
  order: Omit<OrderRow, 'created_at' | 'updated_at'>,
  items: Omit<OrderItemRow, 'id' | 'order_id' | 'shop_id'>[]
): Promise<OrderRow> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO orders (
        id, shop_id, tracking_token, pickup_code, customer_name, customer_phone,
        customer_email, customer_instructions, staff_notes, source, payment_method,
        amount_paise, discount_paise, coupon_code, order_status, payment_status,
        collection_status, requested_pickup_at, razorpay_order_id, payment_id,
        assigned_printer_id, created_by_staff_id, price_override_reason
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      ) RETURNING *`,
      [
        order.id, order.shop_id, order.tracking_token, order.pickup_code,
        order.customer_name, order.customer_phone, order.customer_email ?? null,
        order.customer_instructions ?? null, order.staff_notes ?? null,
        order.source, order.payment_method, order.amount_paise, order.discount_paise,
        order.coupon_code ?? null, order.order_status, order.payment_status,
        order.collection_status, order.requested_pickup_at ?? null,
        order.razorpay_order_id ?? null, order.payment_id ?? null,
        order.assigned_printer_id ?? null, order.created_by_staff_id ?? null,
        order.price_override_reason ?? null,
      ]
    );
    const newOrder = rows[0] as OrderRow;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await client.query(
        `INSERT INTO order_items (
          order_id, shop_id, document_id, file_name, pages, page_range,
          copies, color_mode, paper_size, duplex, finishing, item_paise, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          newOrder.id, order.shop_id, item.document_id, item.file_name,
          item.pages, item.page_range ?? null, item.copies, item.color_mode,
          item.paper_size, item.duplex, item.finishing, item.item_paise, i,
        ]
      );
    }
    return newOrder;
  });
}

/**
 * Atomic read-modify-write for an order.
 * Enforces shop isolation — throws if orderId doesn't belong to shopId.
 * Uses SELECT FOR UPDATE to prevent concurrent mutations.
 */
export async function mutateOrder(
  shopId: string,
  orderId: string,
  fn: (order: OrderRow, client: PoolClient) => Promise<Partial<OrderRow>>
): Promise<OrderRow> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM orders WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [orderId, shopId]
    );
    if (!rows[0]) throw new Error('Order not found');
    const current = rows[0] as OrderRow;
    const patch = await fn(current, client);
    const cols = Object.keys(patch) as (keyof OrderRow)[];
    if (cols.length === 0) return current;
    const setClauses = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');
    const values = cols.map((c) => patch[c]);
    const { rows: updated } = await client.query(
      `UPDATE orders SET ${setClauses}, updated_at = now()
       WHERE id = $1 AND shop_id = $2 RETURNING *`,
      [orderId, shopId, ...values]
    );
    return updated[0] as OrderRow;
  });
}

/** Append an event to the order event log. */
export async function appendOrderEvent(event: {
  order_id: string;
  shop_id: string;
  actor_type: 'customer' | 'staff' | 'agent' | 'system' | 'platform';
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  prev_status?: string | null;
  next_status?: string | null;
  note?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO order_events
       (order_id, shop_id, actor_type, actor_id, actor_name, action, prev_status, next_status, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      event.order_id, event.shop_id, event.actor_type,
      event.actor_id ?? null, event.actor_name ?? null,
      event.action, event.prev_status ?? null, event.next_status ?? null,
      event.note ?? null,
    ]
  );
}

/** Get all events for an order (staff view, shop-scoped). */
export async function getOrderEvents(shopId: string, orderId: string) {
  return query(
    'SELECT * FROM order_events WHERE order_id = $1 AND shop_id = $2 ORDER BY created_at',
    [orderId, shopId]
  );
}

/** Allowed status transitions — same logic as the original single-shop version. */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending:          ['waiting_approval', 'cancelled'],
  waiting_cash:     ['accepted', 'queued', 'cancelled'],
  waiting_approval: ['accepted', 'queued', 'cancelled'],
  accepted:         ['queued', 'cancelled'],
  paid:             ['queued', 'cancelled'],
  queued:           ['downloading', 'cancelled'],
  downloading:      ['printing', 'error'],
  printing:         ['submitted', 'error'],
  submitted:        ['ready', 'error'],
  ready:            ['completed'],
  completed:        ['queued'],   // reprint
  error:            ['queued', 'cancelled'],
  failed:           ['cancelled'],
  cancel_requested: ['cancelled', 'error'],
};

export function validateTransition(from: string, to: string): void {
  const allowed = ORDER_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Cannot transition order from '${from}' to '${to}'. ` +
      `Allowed next states: ${allowed.join(', ') || 'none'}.`
    );
  }
}

/** Claim a print job atomically (agent only). Returns updated order. */
export async function claimPrintJob(
  shopId: string,
  orderId: string,
  agentId: string
): Promise<OrderRow> {
  const { randomUUID } = await import('crypto');
  return mutateOrder(shopId, orderId, async (o) => {
    if (o.refund_state) throw new Error('Refunded order cannot be printed');
    if (o.payment_status !== 'paid') throw new Error('Job not yet paid');
    if (!['paid', 'queued', 'accepted'].includes(o.order_status)) {
      throw new Error('Job already claimed or not ready');
    }
    if (o.claim_token) throw new Error('Job already claimed by another agent');
    return {
      order_status: 'downloading',
      claim_token: randomUUID(),
      claimed_by_agent_id: agentId,
    };
  });
}
