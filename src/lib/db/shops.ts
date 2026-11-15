import { query, queryOne, withTransaction } from './client';

export interface ShopRow {
  id: string;
  name: string;
  subdomain: string;
  status: 'draft' | 'setup_incomplete' | 'testing' | 'active' | 'suspended' | 'paused';
  plan: 'free' | 'basic' | 'pro';
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  created_at: Date;
  updated_at: Date;
}

export interface ShopSettingsRow {
  shop_id: string;
  tagline: string | null;
  logo_url: string | null;
  banner_url: string | null;
  google_maps_url: string | null;
  gst_number: string | null;
  working_hours_text: string | null;
  enable_cash: boolean;
  enable_online: boolean;
  enable_whatsapp: boolean;
  retention_days: number;
  accepting_orders: boolean;
  ordering_paused_reason: string | null;
  auto_print_enabled: boolean;
  privacy_policy_url: string | null;
  terms_url: string | null;
  support_email: string | null;
  support_phone: string | null;
}

export interface ServicePrice {
  key: string;
  paise: number;
}

export interface PrintRulesRow {
  shop_id: string;
  max_upload_size_mb: number;
  max_copies: number;
  max_pages: number;
  max_docs_per_order: number;
  auto_approval_limit: number;
  allow_duplex: boolean;
  allowed_paper_sizes: string[];
  allowed_color_modes: string[];
  allowed_finishing: string[];
  slot_duration_minutes: number;
  slot_capacity: number;
  slot_page_capacity: number;
  min_prep_minutes: number;
  working_hours_start: string;
  working_hours_end: string;
  print_mode: 'self' | 'assisted';
}

export async function getShopBySubdomain(subdomain: string): Promise<ShopRow | null> {
  return queryOne<ShopRow>(
    'SELECT * FROM shops WHERE subdomain = $1',
    [subdomain.toLowerCase()]
  );
}

export async function getShopById(id: string): Promise<ShopRow | null> {
  return queryOne<ShopRow>('SELECT * FROM shops WHERE id = $1', [id]);
}

export async function getAllShops(): Promise<ShopRow[]> {
  return query<ShopRow>('SELECT * FROM shops ORDER BY created_at DESC');
}

export async function createShop(data: {
  name: string;
  subdomain: string;
  plan?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
}): Promise<ShopRow> {
  const row = await queryOne<ShopRow>(
    `INSERT INTO shops (name, subdomain, plan, city, address, phone, email)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.name, data.subdomain.toLowerCase(), data.plan ?? 'basic',
     data.city ?? null, data.address ?? null, data.phone ?? null, data.email ?? null]
  );
  if (!row) throw new Error('Failed to create shop');
  // Seed default settings, rules, prices
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO shop_settings (shop_id) VALUES ($1) ON CONFLICT DO NOTHING`, [row.id]
    );
    await client.query(
      `INSERT INTO print_rules (shop_id) VALUES ($1) ON CONFLICT DO NOTHING`, [row.id]
    );
    const defaultPrices = [
      ['A4_BW', 200], ['A4_Color', 1000], ['A3_BW', 500],
      ['A3_Color', 2000], ['Letter_BW', 250], ['Legal_BW', 300],
      ['staple', 500], ['binding', 3000], ['lamination', 2000], ['spiral', 4000],
    ];
    for (const [key, paise] of defaultPrices) {
      await client.query(
        `INSERT INTO service_prices (shop_id, key, paise) VALUES ($1, $2, $3)`,
        [row.id, key, paise]
      );
    }
  });
  return row;
}

export async function updateShopStatus(
  id: string,
  status: ShopRow['status'],
  reason?: string
): Promise<void> {
  await query(
    `UPDATE shops SET status = $1, updated_at = now() WHERE id = $2`,
    [status, id]
  );
  // record reason in audit_logs handled by caller
  void reason;
}

export async function getShopSettings(shopId: string): Promise<ShopSettingsRow | null> {
  return queryOne<ShopSettingsRow>(
    'SELECT * FROM shop_settings WHERE shop_id = $1',
    [shopId]
  );
}

export async function upsertShopSettings(
  shopId: string,
  patch: Partial<Omit<ShopSettingsRow, 'shop_id'>>
): Promise<void> {
  const cols = (Object.keys(patch) as (keyof typeof patch)[]).filter(k => patch[k] !== undefined);
  if (cols.length === 0) return;
  const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = cols.map((c) => patch[c]);
  await query(
    `INSERT INTO shop_settings (shop_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_,i)=>'$'+(i+2)).join(',')})
     ON CONFLICT (shop_id) DO UPDATE SET ${setClauses}, updated_at = now()`,
    [shopId, ...values]
  );
}

export async function getCurrentPrices(shopId: string): Promise<Record<string, number>> {
  const rows = await query<{ key: string; paise: number }>(
    `SELECT DISTINCT ON (key) key, paise
     FROM service_prices
     WHERE shop_id = $1
     ORDER BY key, valid_from DESC`,
    [shopId]
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.key] = r.paise;
  return map;
}

export async function setPrices(
  shopId: string,
  prices: Record<string, number>
): Promise<void> {
  await withTransaction(async (client) => {
    for (const [key, paise] of Object.entries(prices)) {
      await client.query(
        `INSERT INTO service_prices (shop_id, key, paise) VALUES ($1, $2, $3)`,
        [shopId, key, paise]
      );
    }
  });
}

export async function getPrintRules(shopId: string): Promise<PrintRulesRow | null> {
  return queryOne<PrintRulesRow>(
    'SELECT * FROM print_rules WHERE shop_id = $1',
    [shopId]
  );
}

export async function upsertPrintRules(
  shopId: string,
  patch: Partial<Omit<PrintRulesRow, 'shop_id'>>
): Promise<void> {
  const cols = (Object.keys(patch) as (keyof typeof patch)[]).filter(k => patch[k] !== undefined);
  if (cols.length === 0) return;
  const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = cols.map((c) => patch[c]);
  await query(
    `INSERT INTO print_rules (shop_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_,i)=>'$'+(i+2)).join(',')})
     ON CONFLICT (shop_id) DO UPDATE SET ${setClauses}, updated_at = now()`,
    [shopId, ...values]
  );
}

export async function getPaymentConfig(shopId: string) {
  return queryOne<{
    shop_id: string;
    razorpay_key_id: string | null;
    razorpay_key_secret_enc: string | null;
    razorpay_webhook_secret_enc: string | null;
    razorpay_test_mode: boolean;
    is_configured: boolean;
  }>('SELECT * FROM payment_configs WHERE shop_id = $1', [shopId]);
}

export async function upsertPaymentConfig(
  shopId: string,
  patch: {
    razorpay_key_id?: string;
    razorpay_key_secret_enc?: string;
    razorpay_webhook_secret_enc?: string;
    razorpay_test_mode?: boolean;
    is_configured?: boolean;
  }
): Promise<void> {
  const cols = (Object.keys(patch) as (keyof typeof patch)[]).filter(k => patch[k] !== undefined);
  if(!cols.length)return;
  const setClauses = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = cols.map((c) => patch[c]);
  await query(
    `INSERT INTO payment_configs (shop_id, ${cols.join(",")}) VALUES ($1, ${cols.map((_,i)=>"$"+(i+2)).join(",")})
     ON CONFLICT (shop_id) DO UPDATE SET ${setClauses}, updated_at = now()`,
    [shopId, ...values]
  );
}

export async function getCoupons(shopId: string) {
  return query<{
    id: string; code: string; discount_percent: number | null;
    discount_paise: number | null; min_order_paise: number;
    max_uses: number | null; used_count: number; is_active: boolean;
    valid_from: Date | null; valid_until: Date | null;
  }>('SELECT * FROM coupons WHERE shop_id = $1 ORDER BY created_at DESC', [shopId]);
}

export async function findActiveCoupon(shopId: string, code: string) {
  return queryOne<{
    id: string; code: string; discount_percent: number | null;
    discount_paise: number | null; min_order_paise: number;
    max_uses: number | null; used_count: number;
  }>(
    `SELECT * FROM coupons
     WHERE shop_id = $1 AND code = $2 AND is_active = TRUE
       AND (valid_from IS NULL OR valid_from <= now())
       AND (valid_until IS NULL OR valid_until >= now())
       AND (max_uses IS NULL OR used_count < max_uses)`,
    [shopId, code.toUpperCase()]
  );
}

export async function incrementCouponUsage(couponId: string): Promise<void> {
  await query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [couponId]);
}

export async function isPhoneBlocked(shopId: string, phone: string): Promise<boolean> {
  const row = await queryOne<{ phone: string }>(
    'SELECT phone FROM blocked_phones WHERE shop_id = $1 AND phone = $2',
    [shopId, phone]
  );
  return !!row;
}

export async function getPrinters(shopId: string) {
  return query<{
    id: string; shop_id: string; name: string; brand: string | null;
    model: string | null; connection_type: string; ip_address: string | null;
    supports_color: boolean; supports_a3: boolean; supports_duplex: boolean;
    is_default_bw: boolean; is_default_color: boolean; is_high_speed: boolean;
  }>('SELECT * FROM printers WHERE shop_id = $1 ORDER BY created_at', [shopId]);
}

export async function getAgentByTokenHash(tokenHash: string) {
  return queryOne<{
    id: string; shop_id: string; label: string;
    is_revoked: boolean; agent_version: string | null;
    pc_name: string | null; os_version: string | null;
  }>(
    'SELECT * FROM agents WHERE token_hash = $1 AND is_revoked = FALSE',
    [tokenHash]
  );
}

export async function upsertAgentHeartbeat(
  agentId: string,
  data: { agent_version?: string; pc_name?: string; os_version?: string }
): Promise<void> {
  await query(
    `UPDATE agents SET last_seen_at = now(),
       agent_version = COALESCE($2, agent_version),
       pc_name = COALESCE($3, pc_name),
       os_version = COALESCE($4, os_version)
     WHERE id = $1`,
    [agentId, data.agent_version ?? null, data.pc_name ?? null, data.os_version ?? null]
  );
}

// ─── Staff management ─────────────────────────────────────────────────────────

export interface MemberRow {
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  joined_at: string;
  created_at: string;
  is_suspended: boolean;
}

export interface PendingInvitationRow {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  invited_by_name: string | null;
}

/** List all accepted staff members for a shop. */
export async function getShopMembers(shopId: string): Promise<MemberRow[]> {
  return query<MemberRow>(
    `SELECT m.id AS membership_id, u.id AS user_id, u.name, u.email,
            m.role, m.joined_at, m.created_at, u.is_suspended
     FROM shop_memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.shop_id = $1 AND m.joined_at IS NOT NULL
     ORDER BY m.role DESC, m.joined_at ASC`,
    [shopId]
  );
}

/** List pending (not yet accepted) invitations for a shop. */
export async function getPendingInvitations(shopId: string): Promise<PendingInvitationRow[]> {
  return query<PendingInvitationRow>(
    `SELECT i.id, i.email, i.role, i.expires_at, i.created_at,
            u.name AS invited_by_name
     FROM invitations i
     LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.shop_id = $1
       AND i.accepted_at IS NULL
       AND i.expires_at > now()
     ORDER BY i.created_at DESC`,
    [shopId]
  );
}

/** Create an invitation for a manager or staff member.
 *  Returns the raw token (must be delivered to the invitee — never stored raw). */
export async function inviteStaffMember(
  shopId: string,
  email: string,
  role: 'manager' | 'staff',
  invitedByUserId: string
): Promise<string> {
  const { generateToken, hashToken } = await import('../auth/tokens');
  const raw = generateToken(32);
  const hash = hashToken(raw);
  // If an unexpired pending invite exists for this email+shop, revoke it first.
  await query(
    `UPDATE invitations
     SET accepted_at = now()
     WHERE shop_id = $1 AND lower(email) = lower($2) AND accepted_at IS NULL AND expires_at > now()`,
    [shopId, email]
  );
  await query(
    `INSERT INTO invitations (shop_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + interval '72 hours')`,
    [shopId, email.toLowerCase().trim(), role, hash, invitedByUserId]
  );
  return raw;
}

/** Change a member's role. Owners cannot be demoted via this function. */
export async function updateMemberRole(
  shopId: string,
  userId: string,
  newRole: 'manager' | 'staff'
): Promise<void> {
  const result = await query(
    `UPDATE shop_memberships
     SET role = $3
     WHERE shop_id = $1 AND user_id = $2 AND role != 'owner'`,
    [shopId, userId, newRole]
  );
  if ((result as any).rowCount === 0) {
    throw new Error('Member not found or owner role cannot be changed.');
  }
}

/** Remove a member from a shop. Owners cannot be removed via this function. */
export async function removeMember(shopId: string, userId: string): Promise<void> {
  const result = await query(
    `DELETE FROM shop_memberships
     WHERE shop_id = $1 AND user_id = $2 AND role != 'owner'`,
    [shopId, userId]
  );
  if ((result as any).rowCount === 0) {
    throw new Error('Member not found or owner cannot be removed.');
  }
}

/** Revoke a pending invitation by marking it accepted (invalidates the token). */
export async function revokeInvitation(invitationId: string, shopId: string): Promise<void> {
  const result = await query(
    `UPDATE invitations
     SET accepted_at = now()
     WHERE id = $1 AND shop_id = $2 AND accepted_at IS NULL`,
    [invitationId, shopId]
  );
  if ((result as any).rowCount === 0) {
    throw new Error('Invitation not found or already used.');
  }
}
