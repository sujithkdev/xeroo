'use client';
import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import toast from 'react-hot-toast';
import {
  Loader2, AlertTriangle, Save, Eye, EyeOff,
  UserPlus, Trash2, ShieldCheck, Shield, User, Mail, Clock, Copy, CheckCircle2,
} from 'lucide-react';

type Tab = 'profile' | 'services' | 'hours' | 'staff' | 'payments' | 'notifications' | 'retention' | 'subscription';
const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Shop profile' },
  { key: 'services', label: 'Services & prices' },
  { key: 'hours', label: 'Hours & capacity' },
  { key: 'staff', label: 'Staff & permissions' },
  { key: 'payments', label: 'Payments' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'retention', label: 'Document retention' },
  { key: 'subscription', label: 'Subscription & support' },
];

export default function ShopSettingsPage() {
  const [tab, setTab] = useState<Tab>('profile');
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // local editable copies
  const [shopSettings, setShopSettings] = useState<any>({});
  const [pricing, setPricing] = useState<any>({});
  const [rules, setRules] = useState<any>({});
  const [razorpay, setRazorpay] = useState<any>({});

  // Staff management state
  const [staffData, setStaffData] = useState<{ members: any[]; invitations: any[] } | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const d = await apiFetch('/api/staff/members').then(r => r.json());
      if (d.error) throw new Error(d.error);
      setStaffData(d);
    } catch (e: any) {
      // 409 = local mode — staff management not available
      if (!e.message?.includes('multi-shop')) toast.error('Could not load staff list');
    } finally {
      setStaffLoading(false);
    }
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch('/api/config').then((r) => r.json());
      setConfig(d);
      setShopSettings(d.shopSettings ?? {});
      setPricing(d.pricingConfig ?? {});
      setRules(d.printRules ?? {});
      setRazorpay(d.razorpayConfig ?? {});
      setIsOwner(d.sessionRole === 'owner' || d.isPlatformAdmin === true);
      setDirty(false);
    } catch { toast.error('Could not load settings'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const aliases:Record<string,Tab>={razorpay:'payments',whatsapp:'notifications',shop:'profile',account:'staff'};
    const key=new URLSearchParams(window.location.search).get('tab')||'';
    const selected=aliases[key]||key;
    if(TABS.some(t=>t.key===selected))setTab(selected as Tab);
    void load();
  }, []);

  // Load staff list whenever the staff tab is opened
  useEffect(() => {
    if (tab === 'staff' && !staffData) void loadStaff();
  }, [tab]);

  async function save(payload: Record<string, any>) {
    setSaving(true);
    try {
      await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast.success('Settings saved');
      setDirty(false);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally { setSaving(false); }
  }

  const mark = () => setDirty(true);

  if (loading) return (
    <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
  );

  return (
    <div className="p-5 md:p-8">
      <div className="mb-6">
        <h1 className="page-heading">Shop settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure your shop profile, pricing, staff and integrations.</p>
      </div>

      {dirty && (
        <div className="mb-4 flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <span className="flex items-center gap-2"><AlertTriangle size={14} /> You have unsaved changes.</span>
        </div>
      )}

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Sidebar tabs */}
        <nav className="lg:w-48 shrink-0" aria-label="Settings sections">
          <ul className="space-y-0.5">
            {TABS.map(({ key, label }) => (
              <li key={key}>
                <button
                  onClick={() => setTab(key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${tab === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Panel */}
        <div className="flex-1 min-w-0">
          {/* Profile */}
          {tab === 'profile' && (
            <SettingsSection title="Shop profile & branding" onSave={() => save({ shopSettings })}>
              <Field label="Shop name *" value={shopSettings.name ?? ''} onChange={(v) => { setShopSettings({ ...shopSettings, name: v }); mark(); }} />
              <Field label="Tagline" value={shopSettings.tagline ?? ''} onChange={(v) => { setShopSettings({ ...shopSettings, tagline: v }); mark(); }} />
              <Field label="Address" value={shopSettings.address ?? ''} onChange={(v) => { setShopSettings({ ...shopSettings, address: v }); mark(); }} multiline />
              <Field label="Phone" value={shopSettings.phone ?? ''} onChange={(v) => { setShopSettings({ ...shopSettings, phone: v }); mark(); }} />
              <Field label="Email" type="email" value={shopSettings.email ?? ''} onChange={(v) => { setShopSettings({ ...shopSettings, email: v }); mark(); }} />
              <Field label="Google Maps URL" value={shopSettings.googleMapsUrl ?? ''} onChange={(v) => { setShopSettings({ ...shopSettings, googleMapsUrl: v }); mark(); }} />
              <Field label="GST number" value={shopSettings.gstNumber ?? ''} onChange={(v) => { setShopSettings({ ...shopSettings, gstNumber: v }); mark(); }} />
            </SettingsSection>
          )}

          {/* Services & prices */}
          {tab === 'services' && (
            <SettingsSection title="Services & prices" note="Price changes apply to new quotes only — existing orders are not affected." onSave={() => save({ pricingConfig: pricing })}>
              {[
                ['A4_BW', 'A4 Black & White (per side, ₹)'],
                ['A4_Color', 'A4 Colour (per side, ₹)'],
                ['A3_BW', 'A3 Black & White (per side, ₹)'],
                ['A3_Color', 'A3 Colour (per side, ₹)'],
                ['Letter_BW', 'Letter B&W (per side, ₹)'],
                ['Legal_BW', 'Legal B&W (per side, ₹)'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input type="number" step="0.5" min="0.5" className="input-field max-w-xs"
                    value={pricing[key] ?? ''}
                    onChange={(e) => { setPricing({ ...pricing, [key]: parseFloat(e.target.value) || 0 }); mark(); }}
                  />
                </div>
              ))}
              <div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!rules.allowDuplex} onChange={(e) => { setRules({ ...rules, allowDuplex: e.target.checked }); mark(); }} />
                  Allow double-sided printing
                </label>
              </div>
            </SettingsSection>
          )}

          {/* Hours & capacity */}
          {tab === 'hours' && (
            <SettingsSection title="Hours & pickup capacity" onSave={() => save({ printRules: rules })}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Opening time</label>
                  <input type="time" className="input-field" value={rules.workingHoursStart ?? '08:00'}
                    onChange={(e) => { setRules({ ...rules, workingHoursStart: e.target.value }); mark(); }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Closing time</label>
                  <input type="time" className="input-field" value={rules.workingHoursEnd ?? '21:00'}
                    onChange={(e) => { setRules({ ...rules, workingHoursEnd: e.target.value }); mark(); }} />
                </div>
              </div>
              <Field label="Hours display text (shown to customers)" value={shopSettings.workingHoursText ?? ''}
                onChange={(v) => { setShopSettings({ ...shopSettings, workingHoursText: v }); mark(); }} />
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Min. preparation time (minutes)</label>
                <input type="number" min={5} className="input-field max-w-xs"
                  value={rules.minPrepMinutes ?? 30}
                  onChange={(e) => { setRules({ ...rules, minPrepMinutes: parseInt(e.target.value) }); mark(); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Slot capacity (orders per 30-min slot)</label>
                <input type="number" min={1} className="input-field max-w-xs"
                  value={rules.slotCapacity ?? 5}
                  onChange={(e) => { setRules({ ...rules, slotCapacity: parseInt(e.target.value) }); mark(); }} />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={rules.acceptingOrders !== false}
                    onChange={(e) => { setRules({ ...rules, acceptingOrders: e.target.checked }); mark(); }} />
                  Currently accepting new orders
                </label>
              </div>
            </SettingsSection>
          )}

          {/* Staff */}
          {tab === 'staff' && (
            <StaffTab
              data={staffData}
              loading={staffLoading}
              isOwner={isOwner}
              isLocalMode={config?.capabilities?.localMode === true}
              onRefresh={loadStaff}
            />
          )}

          {/* Payments */}
          {tab === 'payments' && (
            <SettingsSection title="Payment configuration" onSave={() => save({ razorpayConfig: razorpay,shopSettings:{enableCashPayment:shopSettings.enableCashPayment!==false,enableOnlinePayment:!!shopSettings.enableOnlinePayment} })}>
              <div>
                <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
                  <input type="checkbox" checked={shopSettings.enableCashPayment !== false}
                    onChange={(e) => { setShopSettings({ ...shopSettings, enableCashPayment: e.target.checked }); mark(); }} />
                  Accept cash at counter
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!shopSettings.enableOnlinePayment}
                    onChange={(e) => { setShopSettings({ ...shopSettings, enableOnlinePayment: e.target.checked }); mark(); }} />
                  Accept online payments (Razorpay)
                </label>
              </div>
              <Field label="Razorpay Key ID" value={razorpay.keyId ?? ''}
                onChange={(v) => { setRazorpay({ ...razorpay, keyId: v }); mark(); }} />
              <MaskedField label="Razorpay Key Secret" value={razorpay.keySecret ?? ''}
                onChange={(v) => { setRazorpay({ ...razorpay, keySecret: v }); mark(); }} />
              <MaskedField label="Webhook Secret" value={razorpay.webhookSecret ?? ''}
                onChange={(v) => { setRazorpay({ ...razorpay, webhookSecret: v }); mark(); }} />
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <AlertTriangle size={11} className="text-amber-400" />
                Secret values are masked when settings are loaded. Protect access to the server and its backups.
              </p>
            </SettingsSection>
          )}

          {/* Notifications */}
          {tab === 'notifications' && (
            <SettingsSection title="Notifications">
              <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-600">
                {config?.capabilities?.whatsapp ? 'The signed WhatsApp webhook supports PDF intake when server credentials are configured. Customer-ready notifications are recorded manually from the order screen.' : 'WhatsApp intake is not available in this workspace. Contact customers manually and record the outcome from the order screen.'} Email and SMS delivery are not connected.
              </div>
            </SettingsSection>
          )}

          {/* Retention */}
          {tab === 'retention' && (
            <SettingsSection title="Document retention" onSave={() => save({ shopSettings })}>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Retention eligibility (days)</label>
                <input type="number" min={1} max={3650} className="input-field max-w-xs"
                  value={shopSettings.retentionDays ?? (config?.capabilities?.localMode?30:7)}
                  onChange={(e) => { setShopSettings({ ...shopSettings, retentionDays: parseInt(e.target.value) }); mark(); }} />
                <p className="text-xs text-slate-400 mt-1">
                  Eligible files are removed when the operator runs retention cleanup. Active orders and payment reviews remain protected; backups are managed separately. A server RETENTION_DAYS override takes precedence in local mode.
                </p>
              </div>
            </SettingsSection>
          )}

          {/* Subscription */}
          {tab === 'subscription' && (
            <div className="surface p-5">
              <h2 className="font-semibold mb-4">Subscription & support</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-sm mb-6">
                {[
                  ['Assigned plan', config?.plan ?? 'Not configured'],
                  ['Billing', 'Not connected'],
                  ['Support', 'Contact your platform administrator'],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <p className="text-xs text-slate-400">{k as string}</p>
                    <p className="font-medium text-slate-800 mt-0.5">{v as string}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-500">
                Contact your platform administrator for support or plan changes. Subscription payments and renewal dates are not tracked here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, note, children, onSave }: {
  title: string; note?: string; children: React.ReactNode; onSave?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    await onSave();
    setSaving(false);
  };
  return (
    <div className="surface p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {note && <p className="text-xs text-amber-700 mt-1 flex items-center gap-1"><AlertTriangle size={11} />{note}</p>}
      </div>
      {children}
      {onSave && (
        <div className="pt-2 border-t">
          <button onClick={handleSave} disabled={saving} className="btn-primary !py-2 !text-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', multiline = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {multiline ? (
        <textarea className="input-field resize-none w-full" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} className="input-field w-full" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function MaskedField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const isMasked = value === '••••••••••••••••';
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="input-field w-full pr-10"
          value={value}
          placeholder={isMasked ? 'Stored securely — enter new value to change' : ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

// ─── Staff Management Tab ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-violet-100 text-violet-700',
  manager: 'bg-indigo-100 text-indigo-700',
  staff: 'bg-slate-100 text-slate-600',
};

const ROLE_ICON: Record<string, React.ReactNode> = {
  owner: <ShieldCheck size={13} />,
  manager: <Shield size={13} />,
  staff: <User size={13} />,
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_COLORS[role] ?? 'bg-slate-100 text-slate-600'}`}>
      {ROLE_ICON[role]} {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StaffTab({
  data,
  loading,
  isOwner,
  isLocalMode,
  onRefresh,
}: {
  data: { members: any[]; invitations: any[] } | null;
  loading: boolean;
  isOwner: boolean;
  isLocalMode: boolean;
  onRefresh: () => void;
}) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('staff');
  const [inviting, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  if (isLocalMode) {
    return (
      <div className="surface p-5">
        <h2 className="font-semibold mb-3">Staff &amp; permissions</h2>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Staff management is only available in multi-shop mode. In local single-shop mode, access is controlled by the local network.
        </div>
      </div>
    );
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await apiFetch('/api/staff/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setInviteLink(d.invitationUrl);
      setInviteEmail('');
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Could not send invitation');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  async function changeRole(userId: string, newRole: 'manager' | 'staff') {
    setChangingRole(userId);
    try {
      const r = await apiFetch(`/api/staff/members/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Role updated');
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Could not update role');
    } finally {
      setChangingRole(null);
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this shop? They will immediately lose access.`)) return;
    setRemoving(userId);
    try {
      const r = await apiFetch(`/api/staff/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success(`${name} removed`);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Could not remove member');
    } finally {
      setRemoving(null);
    }
  }

  async function revokeInvite(id: string, email: string) {
    if (!confirm(`Revoke the invitation for ${email}?`)) return;
    try {
      const r = await apiFetch(`/api/staff/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success('Invitation revoked');
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Could not revoke invitation');
    }
  }

  return (
    <div className="space-y-4">
      {/* Active members */}
      <div className="surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Staff &amp; permissions</h2>
          {isOwner && (
            <button
              onClick={() => { setShowInviteForm(v => !v); setInviteLink(''); }}
              className="btn-primary !py-1.5 !text-xs flex items-center gap-1.5"
            >
              <UserPlus size={13} />
              {showInviteForm ? 'Cancel' : 'Invite member'}
            </button>
          )}
        </div>

        {/* Invite form */}
        {isOwner && showInviteForm && (
          <div className="mb-5 p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
            {inviteLink ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-indigo-800 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  Invitation created — copy and send this link to the new member.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="input-field flex-1 text-xs font-mono"
                    onFocus={e => e.target.select()}
                  />
                  <button
                    onClick={copyLink}
                    className="btn-secondary !py-1.5 !px-3 flex items-center gap-1 text-xs shrink-0"
                  >
                    {copied ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-indigo-600">
                  The link expires in 72 hours. Keep it private — anyone with the link can join.
                </p>
                <button
                  onClick={() => { setInviteLink(''); setShowInviteForm(false); }}
                  className="text-xs text-indigo-600 underline"
                >
                  Invite another member
                </button>
              </div>
            ) : (
              <form onSubmit={sendInvite} className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-indigo-800 mb-1">Email address</label>
                    <input
                      required
                      type="email"
                      className="input-field w-full"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="staff@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-indigo-800 mb-1">Role</label>
                    <select
                      className="input-field w-full"
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as 'manager' | 'staff')}
                    >
                      <option value="staff">Staff — handle orders, print queue</option>
                      <option value="manager">Manager — staff + prices, refunds, config</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={inviting} className="btn-primary !py-1.5 !text-xs flex items-center gap-1.5">
                    {inviting ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                    {inviting ? 'Creating…' : 'Create invitation link'}
                  </button>
                </div>
                <p className="text-xs text-indigo-600">
                  An invitation link will be generated. Copy and send it to the new member — no email is sent automatically.
                </p>
              </form>
            )}
          </div>
        )}

        {/* Members table */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
        ) : !data ? (
          <p className="text-sm text-slate-400 py-4 text-center">Could not load staff list.</p>
        ) : data.members.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No staff members found.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.members.map((m: any) => (
              <div key={m.user_id} className="flex items-center gap-3 py-3">
                {/* Avatar placeholder */}
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs font-bold shrink-0">
                  {(m.name || m.email).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {m.name || '—'}
                    {m.is_suspended && <span className="ml-1.5 text-xs text-rose-600">(suspended)</span>}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{m.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleBadge role={m.role} />
                  {isOwner && m.role !== 'owner' && (
                    <>
                      <select
                        className="input-field !py-0.5 !text-xs w-auto"
                        value={m.role}
                        disabled={changingRole === m.user_id}
                        onChange={e => changeRole(m.user_id, e.target.value as 'manager' | 'staff')}
                        aria-label={`Change role for ${m.name}`}
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                      </select>
                      <button
                        onClick={() => removeMember(m.user_id, m.name || m.email)}
                        disabled={removing === m.user_id}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        aria-label={`Remove ${m.name}`}
                        title="Remove from shop"
                      >
                        {removing === m.user_id
                          ? <Loader2 size={13} className="animate-spin" />
                          : <Trash2 size={13} />}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending invitations */}
      {data && data.invitations.length > 0 && (
        <div className="surface p-5">
          <h2 className="font-semibold mb-3 text-sm">Pending invitations</h2>
          <div className="divide-y divide-slate-100">
            {data.invitations.map((inv: any) => (
              <div key={inv.id} className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <Mail size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{inv.email}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <Clock size={10} />
                    Expires {new Date(inv.expires_at).toLocaleString('en-IN')}
                    {inv.invited_by_name && ` · Invited by ${inv.invited_by_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleBadge role={inv.role} />
                  {isOwner && (
                    <button
                      onClick={() => revokeInvite(inv.id, inv.email)}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      aria-label={`Revoke invitation for ${inv.email}`}
                      title="Revoke invitation"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role reference */}
      <div className="surface p-5">
        <h2 className="font-semibold text-sm mb-3">Role permissions</h2>
        <div className="text-xs text-slate-600 space-y-2">
          {[
            { role: 'owner', perms: 'All permissions — manage staff, change prices, issue refunds, full config access.' },
            { role: 'manager', perms: 'Manage orders, print queue, change prices, issue refunds, update shop settings.' },
            { role: 'staff', perms: 'View and action orders, manage print queue. Cannot change prices or issue refunds.' },
          ].map(({ role, perms }) => (
            <div key={role} className="flex items-start gap-2">
              <RoleBadge role={role} />
              <p className="mt-0.5">{perms}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
