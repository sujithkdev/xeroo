// Central DB exports — import from '@/lib/db' in API routes
export { getPool, withTransaction, query, queryOne } from './client';
export * from './shops';
export * from './orders';

// ─── Webhook idempotency ─────────────────────────────────────────────────────
import { queryOne, query } from './client';

export async function claimWebhookEvent(
  provider: string,
  eventId: string,
  shopId?: string
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO webhook_events (provider, event_id, shop_id)
       VALUES ($1, $2, $3)`,
      [provider, eventId, shopId ?? null]
    );
    return true;
  } catch {
    return false; // unique constraint violation = already processed
  }
}

export async function finishWebhookEvent(
  provider: string,
  eventId: string,
  outcome: string
): Promise<void> {
  await query(
    `UPDATE webhook_events SET processed_at = now(), outcome = $1
     WHERE provider = $2 AND event_id = $3`,
    [outcome, provider, eventId]
  );
}

// ─── Audit log ───────────────────────────────────────────────────────────────
export async function appendAuditLog(entry: {
  actor_id?: string | null;
  actor_role: string;
  shop_id?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  outcome: 'success' | 'failure';
  reason?: string | null;
  before_json?: object | null;
  after_json?: object | null;
  ip?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs
       (actor_id, actor_role, shop_id, action, target_type, target_id,
        outcome, reason, before_json, after_json, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      entry.actor_id ?? null, entry.actor_role, entry.shop_id ?? null,
      entry.action, entry.target_type ?? null, entry.target_id ?? null,
      entry.outcome, entry.reason ?? null,
      entry.before_json ? JSON.stringify(entry.before_json) : null,
      entry.after_json  ? JSON.stringify(entry.after_json)  : null,
      entry.ip ?? null,
    ]
  );
}

// ─── Payments ────────────────────────────────────────────────────────────────
export async function createPaymentRecord(p: {
  order_id: string;
  shop_id: string;
  amount_paise: number;
  method: 'online' | 'cash';
  provider_ref?: string | null;
  provider_order_id?: string | null;
  status: string;
  collected_by?: string | null;
}) {
  return queryOne(
    `INSERT INTO payments
       (order_id, shop_id, amount_paise, method, provider_ref, provider_order_id, status, collected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [p.order_id, p.shop_id, p.amount_paise, p.method,
     p.provider_ref ?? null, p.provider_order_id ?? null, p.status, p.collected_by ?? null]
  );
}

export async function getPaymentsByShop(shopId: string) {
  return query(
    'SELECT * FROM payments WHERE shop_id = $1 ORDER BY created_at DESC',
    [shopId]
  );
}

export async function createRefundRecord(r: {
  payment_id: string;
  order_id: string;
  shop_id: string;
  amount_paise: number;
  reason: string;
  requested_by?: string | null;
  provider_ref?: string | null;
  status: string;
}) {
  return queryOne(
    `INSERT INTO refunds
       (payment_id, order_id, shop_id, amount_paise, reason, requested_by, provider_ref, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [r.payment_id, r.order_id, r.shop_id, r.amount_paise, r.reason,
     r.requested_by ?? null, r.provider_ref ?? null, r.status]
  );
}

// ─── Pickup capacity ─────────────────────────────────────────────────────────

/** Atomically reserve a slot. Returns reservation id or null if full. */
export async function reservePickupSlot(p: {
  shopId: string;
  slotDate: string;   // YYYY-MM-DD
  slotStart: string;  // HH:MM
  slotEnd: string;
  workload: number;
  ttlMinutes?: number;
}): Promise<string | null> {
  const { withTransaction } = await import('./client');
  return withTransaction(async (client) => {
    // Get capacity for this shop
    const capRow = await client.query(
      'SELECT slot_capacity FROM print_rules WHERE shop_id = $1',
      [p.shopId]
    );
    const capacity: number = capRow.rows[0]?.slot_capacity ?? 5;
    // Sum workload of active reservations in this slot
    const usedRow = await client.query(
      `SELECT COALESCE(SUM(workload),0) AS used
       FROM pickup_reservations
       WHERE shop_id = $1 AND slot_date = $2 AND slot_start = $3
         AND released_at IS NULL
         AND (confirmed = TRUE OR expires_at > now())`,
      [p.shopId, p.slotDate, p.slotStart]
    );
    const used: number = parseInt(usedRow.rows[0]?.used ?? '0', 10);
    if (used + p.workload > capacity) return null;
    const ttl = p.ttlMinutes ?? 10;
    const ins = await client.query(
      `INSERT INTO pickup_reservations
         (shop_id, slot_date, slot_start, slot_end, workload, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval)
       RETURNING id`,
      [p.shopId, p.slotDate, p.slotStart, p.slotEnd, p.workload, ttl]
    );
    return ins.rows[0]?.id ?? null;
  });
}

export async function confirmReservation(reservationId: string, orderId: string): Promise<void> {
  await query(
    'UPDATE pickup_reservations SET confirmed = TRUE, order_id = $1 WHERE id = $2',
    [orderId, reservationId]
  );
}

export async function releaseReservation(reservationId: string): Promise<void> {
  await query(
    'UPDATE pickup_reservations SET released_at = now() WHERE id = $1',
    [reservationId]
  );
}

export async function getAvailableSlots(
  shopId: string,
  slotDate: string
): Promise<{ slotStart: string; slotEnd: string; available: number }[]> {
  const rows = await query<{ slot_start: string; slot_end: string; used: string }>(
    `SELECT slot_start, slot_end, COALESCE(SUM(workload),0) AS used
     FROM pickup_reservations
     WHERE shop_id = $1 AND slot_date = $2
       AND released_at IS NULL
       AND (confirmed = TRUE OR expires_at > now())
     GROUP BY slot_start, slot_end`,
    [shopId, slotDate]
  );
  const capRow = await queryOne<{ slot_capacity: number }>(
    'SELECT slot_capacity FROM print_rules WHERE shop_id = $1',
    [shopId]
  );
  const capacity = capRow?.slot_capacity ?? 5;
  return rows.map((r) => ({
    slotStart: r.slot_start,
    slotEnd: r.slot_end,
    available: Math.max(0, capacity - parseInt(r.used, 10)),
  }));
}
