-- Multi-shop print platform: initial schema
-- Run via: node scripts/migrate.cjs
-- All monetary values stored as integer paise (100 paise = ₹1).
-- Every shop-owned table carries shop_id; never trust a client-submitted shop_id.

BEGIN;

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Shops ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  subdomain    TEXT UNIQUE NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','setup_incomplete','testing','active','suspended','paused')),
  plan         TEXT NOT NULL DEFAULT 'basic'
               CHECK (plan IN ('free','basic','pro')),
  city         TEXT,
  address      TEXT,
  phone        TEXT,
  email        TEXT,
  timezone     TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shops_status_idx ON shops (status);

-- ─── Shop settings (one row per shop) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_settings (
  shop_id                UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  tagline                TEXT,
  logo_url               TEXT,
  banner_url             TEXT,
  google_maps_url        TEXT,
  gst_number             TEXT,
  working_hours_text     TEXT,
  enable_cash            BOOLEAN NOT NULL DEFAULT TRUE,
  enable_online          BOOLEAN NOT NULL DEFAULT FALSE,
  enable_whatsapp        BOOLEAN NOT NULL DEFAULT FALSE,
  retention_days         INT NOT NULL DEFAULT 7,
  accepting_orders       BOOLEAN NOT NULL DEFAULT TRUE,
  ordering_paused_reason TEXT,
  auto_print_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  privacy_policy_url     TEXT,
  terms_url              TEXT,
  support_email          TEXT,
  support_phone          TEXT,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Service prices (versioned per shop) ─────────────────────────────────────
-- Current price = MAX(valid_from) per (shop_id, key).
CREATE TABLE IF NOT EXISTS service_prices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,   -- 'A4_BW','A4_Color','A3_BW','A3_Color','Letter_BW','Legal_BW',
                               -- 'staple','binding','lamination','spiral'
  paise       INT NOT NULL CHECK (paise > 0),
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS service_prices_shop_key_idx ON service_prices (shop_id, key, valid_from DESC);

-- ─── Print rules (one row per shop) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_rules (
  shop_id                UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  max_upload_size_mb     INT NOT NULL DEFAULT 50,
  max_copies             INT NOT NULL DEFAULT 50,
  max_pages              INT NOT NULL DEFAULT 500,
  max_docs_per_order     INT NOT NULL DEFAULT 10,
  auto_approval_limit    INT NOT NULL DEFAULT 50,
  allow_duplex           BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_paper_sizes    TEXT[]  NOT NULL DEFAULT ARRAY['A4','A3','Letter','Legal'],
  allowed_color_modes    TEXT[]  NOT NULL DEFAULT ARRAY['bw','color'],
  allowed_finishing      TEXT[]  NOT NULL DEFAULT ARRAY['none','staple','binding','spiral','lamination'],
  slot_duration_minutes  INT NOT NULL DEFAULT 30,
  slot_capacity          INT NOT NULL DEFAULT 5,
  min_prep_minutes       INT NOT NULL DEFAULT 30,
  working_hours_start    TIME NOT NULL DEFAULT '08:00',
  working_hours_end      TIME NOT NULL DEFAULT '21:00',
  print_mode             TEXT NOT NULL DEFAULT 'assisted'
                         CHECK (print_mode IN ('self','assisted')),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Opening hours & closures ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_hours (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day_of_week  INT  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  opens        TIME NOT NULL,
  closes       TIME NOT NULL,
  UNIQUE (shop_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS shop_closures (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id   UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date      DATE NOT NULL,
  reason    TEXT,
  UNIQUE (shop_id, date)
);

-- ─── Payment credentials (one row per shop, secrets server-only) ─────────────
CREATE TABLE IF NOT EXISTS payment_configs (
  shop_id          UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  razorpay_key_id  TEXT,
  razorpay_key_secret_enc TEXT,  -- encrypted at rest
  razorpay_webhook_secret_enc TEXT,
  razorpay_test_mode BOOLEAN NOT NULL DEFAULT TRUE,
  is_configured    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── WhatsApp config ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_configs (
  shop_id              UUID PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  access_token_enc     TEXT,
  phone_number_id      TEXT,
  business_account_id  TEXT,
  verify_token_enc     TEXT,
  is_configured        BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Users (platform-wide identity) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  password_hash     TEXT,              -- null until password is set
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- ─── Shop memberships ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','manager','staff')),
  invited_by  UUID REFERENCES users(id),
  joined_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON shop_memberships (user_id);
CREATE INDEX IF NOT EXISTS memberships_shop_idx ON shop_memberships (shop_id);

-- ─── Invitations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID REFERENCES shops(id) ON DELETE CASCADE,  -- null = platform admin invite
  email        TEXT NOT NULL,
  role         TEXT NOT NULL,
  token_hash   TEXT UNIQUE NOT NULL,   -- SHA-256 of the emailed token
  invited_by   UUID REFERENCES users(id),
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invitations_hash_idx ON invitations (token_hash);

-- ─── Sessions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_idx  ON sessions (user_id);

-- ─── Password recovery tokens ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recovery_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_token_idx ON recovery_tokens (token_hash);

-- ─── Documents (metadata; bytes in object storage) ───────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  storage_key  TEXT NOT NULL UNIQUE,   -- 'documents/<shop_id>/<doc_id>.pdf'
  file_name    TEXT NOT NULL,
  pages        INT  NOT NULL,
  size_bytes   INT  NOT NULL,
  checksum     TEXT NOT NULL,          -- SHA-256 hex
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,            -- set when linked to an order
  order_id     UUID                    -- FK added after orders table
);
CREATE INDEX IF NOT EXISTS documents_shop_idx ON documents (shop_id);
CREATE INDEX IF NOT EXISTS documents_order_idx ON documents (order_id);

-- ─── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  tracking_token        TEXT UNIQUE NOT NULL,
  pickup_code           TEXT NOT NULL,
  customer_name         TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  customer_email        TEXT,
  customer_instructions TEXT,
  staff_notes           TEXT,
  source                TEXT NOT NULL DEFAULT 'web'
                        CHECK (source IN ('web','counter','whatsapp')),
  payment_method        TEXT NOT NULL
                        CHECK (payment_method IN ('online','cash')),
  amount_paise          INT  NOT NULL CHECK (amount_paise > 0),
  discount_paise        INT  NOT NULL DEFAULT 0,
  coupon_code           TEXT,
  -- Three independent state dimensions
  order_status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (order_status IN ('pending','accepted','queued','downloading','printing',
                             'submitted','ready','completed','cancelled','failed',
                             'cancel_requested','waiting_approval','waiting_cash','error')),
  payment_status        TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','pending','paid','refund_pending','refunded','failed')),
  collection_status     TEXT NOT NULL DEFAULT 'pending'
    CHECK (collection_status IN ('pending','ready','collected')),
  -- Pickup
  requested_pickup_at   TIMESTAMPTZ,
  confirmed_pickup_at   TIMESTAMPTZ,
  ready_at              TIMESTAMPTZ,
  collected_at          TIMESTAMPTZ,
  -- Payment provider
  razorpay_order_id     TEXT,
  payment_id            TEXT,
  refund_id             TEXT,
  refund_state          TEXT CHECK (refund_state IN ('pending','processed','needs_review')),
  -- Print
  assigned_printer_id   UUID,
  claim_token           TEXT,
  claimed_by_agent_id   UUID,
  -- Counter order
  created_by_staff_id   UUID REFERENCES users(id),
  price_override_reason TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_shop_status_idx    ON orders (shop_id, order_status);
CREATE INDEX IF NOT EXISTS orders_shop_payment_idx   ON orders (shop_id, payment_status);
CREATE INDEX IF NOT EXISTS orders_shop_created_idx   ON orders (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_shop_pickup_idx    ON orders (shop_id, requested_pickup_at);
CREATE INDEX IF NOT EXISTS orders_tracking_token_idx ON orders (tracking_token);
CREATE INDEX IF NOT EXISTS orders_claim_token_idx    ON orders (claim_token) WHERE claim_token IS NOT NULL;

-- Add FK from documents → orders now that orders exists
ALTER TABLE documents ADD CONSTRAINT documents_order_fk
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
  NOT VALID;  -- skip row validation for performance; constraint enforced on inserts

-- ─── Order items (one row per document in the order) ─────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id)    ON DELETE CASCADE,
  shop_id      UUID NOT NULL REFERENCES shops(id)     ON DELETE RESTRICT,
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  file_name    TEXT NOT NULL,
  pages        INT  NOT NULL,
  page_range   TEXT,                   -- '1-5,8' or NULL = all pages
  copies       INT  NOT NULL,
  color_mode   TEXT NOT NULL CHECK (color_mode IN ('bw','color')),
  paper_size   TEXT NOT NULL,
  duplex       TEXT NOT NULL CHECK (duplex IN ('simplex','duplex')),
  finishing    TEXT NOT NULL DEFAULT 'none',
  item_paise   INT  NOT NULL,          -- price snapshot at order time
  sort_order   INT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_shop_idx  ON order_items (shop_id);

-- ─── Order events (append-only audit trail) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS order_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shop_id      UUID NOT NULL REFERENCES shops(id)  ON DELETE CASCADE,
  actor_type   TEXT NOT NULL CHECK (actor_type IN ('customer','staff','agent','system','platform')),
  actor_id     UUID,
  actor_name   TEXT,
  action       TEXT NOT NULL,
  prev_status  TEXT,
  next_status  TEXT,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id);
CREATE INDEX IF NOT EXISTS order_events_shop_idx  ON order_events (shop_id, created_at DESC);

-- ─── Payments ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  shop_id          UUID NOT NULL REFERENCES shops(id)  ON DELETE RESTRICT,
  amount_paise     INT  NOT NULL,
  method           TEXT NOT NULL CHECK (method IN ('online','cash')),
  provider_ref     TEXT,               -- Razorpay payment_id or 'cash:<orderId>'
  provider_order_id TEXT,
  status           TEXT NOT NULL,
  collected_by     UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_shop_idx  ON payments (shop_id);
CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id);

-- ─── Refunds ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  order_id      UUID NOT NULL REFERENCES orders(id)   ON DELETE RESTRICT,
  shop_id       UUID NOT NULL REFERENCES shops(id)    ON DELETE RESTRICT,
  amount_paise  INT  NOT NULL,
  reason        TEXT NOT NULL,
  requested_by  UUID REFERENCES users(id),
  provider_ref  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processed','failed','needs_review')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Printers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS printers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  brand            TEXT,
  model            TEXT,
  connection_type  TEXT NOT NULL DEFAULT 'USB',
  ip_address       TEXT,
  supports_color   BOOLEAN NOT NULL DEFAULT FALSE,
  supports_a3      BOOLEAN NOT NULL DEFAULT FALSE,
  supports_duplex  BOOLEAN NOT NULL DEFAULT TRUE,
  is_default_bw    BOOLEAN NOT NULL DEFAULT FALSE,
  is_default_color BOOLEAN NOT NULL DEFAULT FALSE,
  is_high_speed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS printers_shop_idx ON printers (shop_id);

-- ─── Agents (one per shop computer) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Counter PC',
  token_hash    TEXT UNIQUE NOT NULL,  -- SHA-256 of bearer token; raw token never stored
  last_seen_at  TIMESTAMPTZ,
  agent_version TEXT,
  pc_name       TEXT,
  os_version    TEXT,
  is_revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agents_shop_idx  ON agents (shop_id);
CREATE INDEX IF NOT EXISTS agents_token_idx ON agents (token_hash);

-- ─── Print jobs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS print_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id)   ON DELETE RESTRICT,
  shop_id         UUID NOT NULL REFERENCES shops(id)    ON DELETE RESTRICT,
  printer_id      UUID REFERENCES printers(id),
  agent_id        UUID REFERENCES agents(id),
  claim_token     TEXT UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','claimed','downloading','printing','submitted','completed','error','uncertain')),
  storage_key     TEXT NOT NULL,       -- object-storage key for the PDF
  print_settings  JSONB NOT NULL,      -- copies, color_mode, paper_size, duplex, orientation
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS print_jobs_order_idx  ON print_jobs (order_id);
CREATE INDEX IF NOT EXISTS print_jobs_shop_idx   ON print_jobs (shop_id);
CREATE INDEX IF NOT EXISTS print_jobs_status_idx ON print_jobs (shop_id, status);

-- ─── Print attempts (per execution attempt) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS print_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES print_jobs(id)  ON DELETE CASCADE,
  order_id      UUID NOT NULL REFERENCES orders(id)      ON DELETE CASCADE,
  shop_id       UUID NOT NULL REFERENCES shops(id)       ON DELETE CASCADE,
  outcome       TEXT NOT NULL CHECK (outcome IN ('success','error','uncertain','cancelled')),
  error_msg     TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  triggered_by  UUID REFERENCES users(id),
  reason        TEXT         -- required for reprints
);
CREATE INDEX IF NOT EXISTS print_attempts_job_idx ON print_attempts (job_id);

-- ─── Pickup reservations (atomic capacity management) ────────────────────────
CREATE TABLE IF NOT EXISTS pickup_reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  slot_date   DATE NOT NULL,
  slot_start  TIME NOT NULL,
  slot_end    TIME NOT NULL,
  workload    INT  NOT NULL DEFAULT 1,  -- pages×copies contribution
  expires_at  TIMESTAMPTZ NOT NULL,
  confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  released_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_shop_slot_idx ON pickup_reservations (shop_id, slot_date, slot_start);

-- ─── Coupons ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  discount_percent NUMERIC(5,2),
  discount_paise   INT,
  min_order_paise  INT NOT NULL DEFAULT 0,
  max_uses         INT,
  used_count       INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from       TIMESTAMPTZ,
  valid_until      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shop_id, code)
);
CREATE INDEX IF NOT EXISTS coupons_shop_idx ON coupons (shop_id, is_active);

-- ─── Blocked phones (per shop) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_phones (
  shop_id  UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  phone    TEXT NOT NULL,
  PRIMARY KEY (shop_id, phone)
);

-- ─── Webhook event idempotency ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  shop_id      UUID REFERENCES shops(id) ON DELETE CASCADE,
  payload      JSONB,
  processed_at TIMESTAMPTZ,
  outcome      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- ─── Audit log (append-only, sensitive actions) ───────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES users(id),
  actor_role   TEXT NOT NULL,
  shop_id      UUID REFERENCES shops(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    UUID,
  outcome      TEXT NOT NULL CHECK (outcome IN ('success','failure')),
  reason       TEXT,
  before_json  JSONB,
  after_json   JSONB,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_shop_idx  ON audit_logs (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs (actor_id, created_at DESC);

-- ─── Subscriptions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
  plan            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','trial','grace','expired','cancelled')),
  trial_ends_at   TIMESTAMPTZ,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  amount_paise    INT NOT NULL,
  billing_method  TEXT NOT NULL DEFAULT 'manual',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  shop_id          UUID NOT NULL REFERENCES shops(id)         ON DELETE RESTRICT,
  amount_paise     INT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('paid','pending','failed')),
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at          TIMESTAMPTZ,
  provider_ref     TEXT
);

-- ─── Schema version marker ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations (version) VALUES ('001_initial') ON CONFLICT DO NOTHING;

COMMIT;
