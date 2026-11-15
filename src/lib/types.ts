export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'queued'
  | 'printing'
  | 'completed'
  | 'cancelled'
  | 'waiting_approval'
  | 'waiting_cash'
  | 'cancel_requested'
  | 'downloading'
  | 'error'
  | 'submitted'
  | 'ready'        // staff confirmed output is ready for pickup
  | 'collected';   // customer has physically collected

/** Customer-visible 5-stage progress */
export type CustomerStage = 'submitted' | 'accepted' | 'preparing' | 'ready' | 'collected';

export type PrintColorMode = 'bw' | 'color';
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal' | 'A5' | 'B4';
export type DuplexMode = 'simplex' | 'duplex';
export type OrientationMode = 'portrait' | 'landscape';

export type FinishingOption = 'staple' | 'binding' | 'lamination' | 'spiral' | 'none';
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refund_pending' | 'refunded' | 'failed';
export type CollectionStatus = 'pending' | 'ready' | 'collected';

/** Settings for a single document within a multi-document order */
export interface DocumentItem {
  id: string;              // client-side UUID
  fileUrl: string;
  fileName: string;
  fileSize: number;        // MB
  pages: number;           // validated server-side
  pageRange?: string;      // e.g. "1-5,8" — blank = all pages
  copies: number;
  colorMode: PrintColorMode;
  paperSize: PaperSize;
  duplex: DuplexMode;
  orientation: OrientationMode;
  finishing: FinishingOption;
  itemAmountPaise: number; // server-computed, stored in paise
}

/** A pickup slot — server-assigned, customer-visible */
export interface PickupSlot {
  date: string;            // ISO date string "2024-01-15"
  startTime: string;       // "14:00"
  endTime: string;         // "14:30"
  label: string;           // "2:00 – 2:30 PM"
  available: boolean;
  isEarliest?: boolean;
}

/** Temporary reservation returned by server */
export interface PickupReservation {
  reservationId: string;
  slot: PickupSlot;
  expiresAt: string;       // ISO datetime
}

/** Activity log entry */
export interface ActivityEntry {
  id: string;
  orderId: string;
  actor: string;           // 'customer' | 'staff:<name>' | 'system'
  action: string;          // human-readable action description
  note?: string;           // optional reason / detail
  timestamp: string;       // ISO datetime
}

/** Print attempt record */
export interface PrintAttempt {
  id: string;
  orderId: string;
  printerId: string;
  printerName: string;
  startedAt: string;
  endedAt?: string;
  outcome: 'success' | 'error' | 'uncertain' | 'cancelled';
  errorDetail?: string;
  staffId?: string;        // who triggered reprint
  reason?: string;         // reason for reprint
}

export interface Order {
  paidAt?: string;
  refundedAt?: string;
  synthetic?: boolean;
  quoteId?:string;
  requestedPickupAt?:string;
  confirmedPickupAt?:string;
  reservationExpiresAt?:string;
  pickupNeedsReschedule?:boolean;
  capacityUnits?:number;
  checkoutKey?: string;
  requestFingerprint?: string;
  razorpayOrderId?: string;
  claimedBy?: string;
  claimToken?: string;
  refundState?: 'pending' | 'processed' | 'needs_review';
  refundId?: string;
  refundReason?: string;
  id: string;
  trackingToken?: string;  // strong private token for customer tracking URL
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerInstructions?: string; // optional order notes from customer
  staffNotes?: string;           // internal staff-only notes
  // Legacy single-doc fields (preserved for backward compat)
  fileName: string;
  fileSize: number;        // in MB
  fileUrl?: string;
  pages: number;
  copies: number;
  paperSize: PaperSize;
  colorMode: PrintColorMode;
  duplex: DuplexMode;
  orientation: OrientationMode;
  finishing?: FinishingOption;
  // Multi-doc support
  documents?: DocumentItem[];
  amount: number;          // total in INR (kept for compat; amountPaise is canonical)
  amountPaise?: number;    // total in paise (canonical)
  discountAmountPaise?: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  collectionStatus?: CollectionStatus;
  source: 'web' | 'whatsapp' | 'counter';
  paymentMethod?: 'online' | 'cash' | 'upi_qr';
  paymentId?: string;
  isPaid?: boolean;
  couponCode?: string;
  // Pickup
  requestedPickupSlot?: PickupSlot;
  confirmedPickupSlot?: PickupSlot;
  reservationId?: string;
  pickupCode: string;
  // Production
  assignedPrinterId?: string;
  printAttempts?: PrintAttempt[];
  activityLog?: ActivityEntry[];
  // Counter order
  createdByStaff?: string;
  priceOverrideReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name?: string;
  phone: string;
  email?: string;
  totalOrders: number;
  totalSpent: number;
  isBlocked: boolean;
  notes?: string;
  createdAt: string;
  lastOrderAt: string;
}

export interface Printer {
  id: string;
  name: string;
  brand: string;
  model: string;
  status: 'online' | 'offline' | 'printing' | 'idle' | 'error';
  connectionType: 'USB' | 'LAN' | 'WiFi';
  ipAddress?: string;
  inkLevels: {
    black: number;
    cyan?: number;
    magenta?: number;
    yellow?: number;
  };
  paperLevels: {
    A4: number;
    A3?: number;
  };
  isDefault: boolean;
  isDefaultBW?: boolean;
  isDefaultColor?: boolean;
  supportsColor?: boolean;
  supportsA3?: boolean;
  isHighSpeed?: boolean;
  supportsDuplex?: boolean;
  pairingCode?: string;   // short-lived OTP for pairing, never stored long-term
  pairedComputerName?: string;
  lastHeartbeat?: string;
  agentVersion?: string;
}

export interface Pricing {
  A4_BW: number;
  A4_Color: number;
  A3_BW: number;
  A3_Color: number;
  Letter_BW: number;
  Legal_BW: number;
  // Finishing surcharges (per item)
  staple?: number;
  binding?: number;
  lamination?: number;
  spiral?: number;
}

export interface PrintRules {
  maxUploadSizeMB: number;
  maxCopies: number;
  maxPages: number;
  maxDocumentsPerOrder?: number;  // multi-doc limit
  autoApprovalPageLimit: number;
  allowedFileTypes: string[];
  allowedPaperSizes: PaperSize[];
  allowedColorModes: PrintColorMode[];
  allowDuplex: boolean;
  allowedFinishing?: FinishingOption[];
  workingHoursStart: string;
  workingHoursEnd: string;
  printMode?: 'self' | 'assisted';
  // Pickup scheduling
  slotDurationMinutes?: number;   // default 30
  slotCapacity?: number;          // max concurrent orders per slot
  slotPageCapacity?: number;
  minPrepMinutes?: number;        // minimum preparation time
  // Ordering
  acceptingOrders?: boolean;
  orderingPausedReason?: string;
}

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  isConfigured: boolean;
  testMode: boolean;
}

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  isConfigured: boolean;
}

export interface ShopSettings {
  name: string;
  tagline: string;
  logoUrl?: string;
  bannerUrl?: string;
  address: string;
  phone: string;
  email: string;
  workingHoursText: string;
  googleMapsUrl?: string;
  gstNumber?: string;
  // Extended settings
  timezone?: string;
  enableCashPayment?: boolean;
  enableOnlinePayment?: boolean;
  enableWhatsApp?: boolean;
  retentionDays?: number;         // how long to keep uploaded documents
  privacyPolicyUrl?: string;
  termsUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  subdomain?: string;
}

export interface Ticket {
  id: string;
  subject: string;
  message: string;
  createdAt: string;
  status: 'open' | 'in_progress' | 'resolved';
}

export interface ShopTenant {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  subdomain?: string;
  plan: 'free' | 'basic' | 'pro';
  lifecycleStatus: 'draft' | 'setup_incomplete' | 'testing' | 'active' | 'suspended' | 'paused';
  /** @deprecated use lifecycleStatus */
  status?: 'active' | 'paused' | 'suspended';
  shopUrl: string;
  logoUrl?: string;
  razorpayConfigured: boolean;
  whatsappConfigured: boolean;
  agentConnected: boolean;
  agentLastSeen?: string;
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  monthlyRevenue: number;
  joinedAt: string;
  lastActiveAt: string;
  notes?: string;
  suspendedReason?: string;
  subscriptionRenewsAt?: string;
}

// ─── Platform admin types ────────────────────────────────────────────────────

export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: 'platform_admin' | 'shop_owner' | 'shop_staff';
  shopMemberships: ShopMembership[];
  invitationStatus?: 'pending' | 'accepted';
  createdAt: string;
  lastLoginAt?: string;
  isSuspended?: boolean;
}

export interface ShopMembership {
  shopId: string;
  shopName: string;
  role: 'owner' | 'manager' | 'staff';
  joinedAt: string;
}

export interface Subscription {
  id: string;
  shopId: string;
  shopName: string;
  plan: 'free' | 'basic' | 'pro';
  status: 'active' | 'trial' | 'grace' | 'expired' | 'cancelled';
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount: number;           // in paise
  billingMethod: 'manual' | 'razorpay';
  invoices: Invoice[];
  cancelledAt?: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  amount: number;           // paise
  status: 'paid' | 'pending' | 'failed';
  issuedAt: string;
  paidAt?: string;
  reference?: string;
}

export interface HealthIndicator {
  name: string;
  status: 'ok' | 'degraded' | 'error' | 'unknown';
  value?: string;
  detail?: string;
  checkedAt: string;
}

export interface SupportTicket {
  id: string;
  shopId?: string;
  shopName?: string;
  category: 'billing' | 'technical' | 'order' | 'account' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'waiting_shop' | 'resolved' | 'closed';
  subject: string;
  description: string;
  relatedOrderId?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  internalNotes?: string;
  resolutionSummary?: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  actorRole: string;
  shopId?: string;
  shopName?: string;
  action: string;
  targetType: string;
  targetId: string;
  outcome: 'success' | 'failure';
  reason?: string;
  changeSummary?: string;
  correlationId?: string;
  timestamp: string;
}
