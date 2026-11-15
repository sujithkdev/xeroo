'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Activity, Globe, Users, CreditCard, Server,
  HeadphonesIcon, ScrollText, Loader2, WifiOff, AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import toast from 'react-hot-toast';

type Tab = 'overview' | 'domains' | 'members' | 'billing' | 'health' | 'support' | 'audit';
const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'domains', label: 'Setup & domains', icon: Globe },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'billing', label: 'Plan & billing', icon: CreditCard },
  { key: 'health', label: 'Usage & health', icon: Server },
  { key: 'support', label: 'Support history', icon: HeadphonesIcon },
  { key: 'audit', label: 'Audit events', icon: ScrollText },
];

export default function ShopDetailPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const [shop, setShop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [invitation,setInvitation]=useState('');
  const [saving,setSaving]=useState(false);
  async function changeShop(action:string){
    const reason=action==='renew_invitation'?'':window.prompt('Reason for this change (at least 5 characters):');
    if(reason===null)return;setSaving(true);
    try{const response=await apiFetch('/api/admin/shops',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:shopId,action,reason})});const data=await response.json();if(!response.ok)throw Error(data.error||'Update failed');if(data.invitationUrl)setInvitation(data.invitationUrl);if(data.status)setShop((s:any)=>({...s,status:data.status,lifecycleStatus:data.status}));toast.success(data.invitationUrl?'Activation link renewed. Share it privately with the owner.':'Shop updated. Ordering and printing remain paused until setup is checked.');}catch(e){toast.error(e instanceof Error?e.message:'Update failed');}finally{setSaving(false);}
  }

  useEffect(() => {
    apiFetch('/api/admin/shops').then((r) => r.json()).then((d) => {
      const found = (d.shops ?? []).find((s: any) => s.id === shopId);
      setShop(found ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [shopId]);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-400" /></div>;
  if (!shop) return (
    <div className="p-8 text-center">
      <AlertTriangle size={28} className="mx-auto text-amber-400 mb-3" />
      <p className="text-slate-600">Shop not found</p>
      <Link href="/admin/shops" className="btn-secondary mt-4 inline-flex">← Back</Link>
    </div>
  );

  const status = shop.lifecycleStatus ?? shop.status ?? 'active';

  return (
    <div className="p-5 md:p-8 max-w-4xl">
      <Link href="/admin/shops" className="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1 mb-5">
        <ArrowLeft size={14} /> Shops directory
      </Link>

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{shop.name}</h1>
          {shop.subdomain && <p className="text-sm text-slate-500 mt-0.5">{shop.subdomain}.yourdomain.com</p>}
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status === 'active' ? 'bg-emerald-100 text-emerald-700' : status === 'suspended' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
              {status.replace('_', ' ')}
            </span>
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full capitalize">{shop.plan ?? 'free'}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button disabled={saving} onClick={() => changeShop('renew_invitation')} className="btn-secondary !py-2 !text-xs">Renew activation link</button>
          {status !== 'suspended' ? (
            <button disabled={saving} onClick={() => changeShop('suspend')} className="btn-secondary !py-2 !text-xs text-rose-700 hover:bg-rose-50">Suspend</button>
          ) : (
            <button disabled={saving} onClick={() => changeShop('reactivate')} className="btn-primary !py-2 !text-xs">Reactivate</button>
          )}
        </div>
      </div>

      {invitation&&<div className="surface p-4 mb-4"><p>Share this activation link privately with the shop owner. It expires in 48 hours.</p><input className="input-field w-full mt-2" readOnly value={invitation} onFocus={e=>e.target.select()}/></div>}
      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="surface p-5">
            <h2 className="font-semibold mb-3 text-sm">Shop details</h2>
            <dl className="text-sm space-y-2.5">
              {[['Address', shop.address], ['Phone', shop.phone], ['Email', shop.email], ['Owner', shop.ownerName], ['City', shop.city], ['Joined', shop.joinedAt ? new Date(shop.joinedAt).toLocaleDateString('en-IN') : '—']].map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-slate-400">{k as string}</dt><dd className="font-medium mt-0.5">{v as string || '—'}</dd></div>
              ))}
            </dl>
          </div>
          <div className="surface p-5">
            <h2 className="font-semibold mb-3 text-sm">Integrations</h2>
            <dl className="text-sm space-y-2.5">
              {[
                ['Razorpay', shop.razorpayConfigured ? '✓ Configured' : '✗ Not configured'],
                ['WhatsApp', shop.whatsappConfigured ? '✓ Configured' : '✗ Not configured'],
                ['Print agent', shop.agentConnected ? '✓ Connected' : '✗ Offline'],
              ].map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-slate-400">{k as string}</dt><dd className={`font-medium mt-0.5 ${(v as string).startsWith('✓') ? 'text-emerald-700' : 'text-slate-500'}`}>{v as string}</dd></div>
              ))}
            </dl>
          </div>
          <div className="surface p-5">
            <h2 className="font-semibold mb-3 text-sm">Stats</h2>
            <dl className="text-sm space-y-2">
              {[['Total orders', shop.totalOrders ?? 0], ['Customers', shop.totalCustomers ?? 0], ['Revenue (all time)', `₹${(shop.totalRevenue ?? 0).toLocaleString('en-IN')}`]].map(([k, v]) => (
                <div key={k as string} className="flex justify-between"><dt className="text-slate-500">{k as string}</dt><dd className="font-medium">{v as any}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {tab === 'domains' && (
        <div className="surface p-5 space-y-4">
          <h2 className="font-semibold">Domain configuration</h2>
          <dl className="text-sm space-y-3">
            <div><dt className="text-xs text-slate-400">Customer URL</dt><dd className="font-mono text-slate-800 mt-0.5">{shop.subdomain ?? 'local'}.yourdomain.com</dd></div>
            <div><dt className="text-xs text-slate-400">Shop dashboard</dt><dd className="font-mono text-slate-800 mt-0.5">{shop.subdomain ?? 'local'}.yourdomain.com/shop</dd></div>
          </dl>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            Subdomain changes affect all existing customer links. A migration plan must be agreed before proceeding.
          </div>
        </div>
      )}

      {['members', 'billing', 'health', 'support', 'audit'].includes(tab) && (
        <div className="surface p-8 text-center text-sm text-slate-400">
          <p className="font-medium text-slate-600 mb-2">{TABS.find((t) => t.key === tab)?.label} — coming in full multi-shop release</p>
          <p>This tab will show {tab === 'members' ? 'staff memberships and invitations' : tab === 'billing' ? 'subscription invoices and plan changes' : tab === 'health' ? 'agent connectivity and error rates' : tab === 'support' ? 'support case history for this shop' : 'authorized change events for this shop'}.</p>
        </div>
      )}
    </div>
  );
}
