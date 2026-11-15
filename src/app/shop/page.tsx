'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Collections from '@/components/Collections';
import {
  ShoppingBag, AlertTriangle, Printer, Wallet, RefreshCw,
  CheckCircle2, PauseCircle, PlayCircle, ArrowUpRight,
  Clock, Package, Loader2, WifiOff, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { Order } from '@/lib/types';
import { apiFetch } from '@/lib/apiFetch';
import toast from 'react-hot-toast';

export default function ShopOverview() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [togglingOrdering, setTogglingOrdering] = useState(false);
  const [togglingPrint, setTogglingPrint] = useState(false);

  const [owner,setOwner]=useState(false);
  useEffect(()=>{fetch('/api/auth/session').then(r=>r.json()).then(s=>setOwner(s.mode==='local'||s.user?.isPlatformAdmin||s.user?.role==='owner')).catch(()=>{});},[]);

  async function refresh() {
    try {
      const [o, c] = await Promise.all([
        apiFetch('/api/orders').then((r) => r.json()),
        apiFetch('/api/config').then((r) => r.json()),
      ]);
      setOrders(o.orders || []);
      setConfig(c);
      setError('');
    } catch {
      setError('Could not refresh. Displayed data may be stale.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  async function toggleOrdering() {
    setTogglingOrdering(true);
    const current = config?.printRules?.acceptingOrders !== false;
    try {
      await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printRules: { ...config?.printRules, acceptingOrders: !current } }),
      });
      await refresh();
      toast.success(current ? 'New ordering paused' : 'Ordering resumed');
    } catch {
      toast.error('Could not update ordering status');
    } finally {
      setTogglingOrdering(false);
    }
  }

  async function toggleAutoPrint() {
    setTogglingPrint(true);
    try {
      await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoPrintEnabled: !config?.autoPrintEnabled }),
      });
      await refresh();
      toast.success(config?.autoPrintEnabled ? 'Auto-print paused' : 'Auto-print resumed');
    } catch {
      toast.error('Could not update print status');
    } finally {
      setTogglingPrint(false);
    }
  }

  const attention = orders.filter((o) =>
    ['waiting_cash', 'waiting_approval', 'error', 'failed', 'cancel_requested'].includes(o.status)
  );
  const active = orders.filter((o) =>
    ['queued', 'printing', 'downloading', 'submitted'].includes(o.status)
  );
  const readyOrders = orders.filter((o) => ['ready', 'completed'].includes(o.status));
  const agentOnline =
    config?.lastAgentPing &&
    Date.now() - new Date(config.lastAgentPing).getTime() < 15000;
  const acceptingOrders = config?.printRules?.acceptingOrders !== false;
  const autoPrint = !!config?.autoPrintEnabled;

  const metrics = [
    { label: 'Needs attention', value: attention.length, icon: AlertTriangle, href: '/shop/inbox', urgent: attention.length > 0 },
    { label: 'Ready for pickup', value: readyOrders.length, icon: Package, href: '/shop/orders?status=ready', urgent: readyOrders.length > 0 },
    { label: 'In production', value: active.length, icon: Printer, href: '/shop/queue', urgent: false },
  ];

  return (
    <div className="p-5 md:p-8 space-y-7">

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="eyebrow !mb-2">YOUR SHOP AT A GLANCE</p>
          <h1 className="page-heading">{config?.shopSettings?.name || 'Shop overview'}</h1>
          <p className="text-sm text-slate-500 mt-2">Orders, priorities and print desk status.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/shop/orders/new" className="btn-primary !py-2 !text-sm">
            <Package size={15} /> Counter order
          </Link>
          <button onClick={refresh} className="btn-secondary !py-2 !text-sm">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <WifiOff size={15} /> {error}
        </div>
      )}

      {/* Controls row */}
      {owner && <Collections />}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="surface p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">New order acceptance</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {acceptingOrders ? 'Customers can place orders online' : 'Online ordering is paused'}
            </p>
          </div>
          <button
            onClick={toggleOrdering}
            disabled={!owner || togglingOrdering}
            aria-pressed={acceptingOrders}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${acceptingOrders ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
          >
            {togglingOrdering ? <Loader2 size={14} className="animate-spin" /> :
              acceptingOrders ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {acceptingOrders ? 'Accepting' : 'Paused'}
          </button>
        </div>

        <div className="surface p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">Automatic printing</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {autoPrint ? 'Paid orders sent to printer automatically' : 'Auto-print is paused — manual queue only'}
            </p>
          </div>
          <button
            onClick={toggleAutoPrint}
            disabled={!owner || togglingPrint}
            aria-pressed={autoPrint}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${autoPrint ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {togglingPrint ? <Loader2 size={14} className="animate-spin" /> :
              autoPrint ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            {autoPrint ? 'Enabled' : 'Paused'}
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metrics.map(({ label, value, icon: Icon, href, urgent }) => (
          <Link key={label} href={href}
            className={`surface p-5 hover:border-indigo-300 transition-colors ${urgent && typeof value === 'number' && value > 0 ? 'border-amber-300 bg-amber-50/40' : ''}`}
          >
            <div className="flex items-center justify-between text-slate-500 text-sm">
              <span>{label}</span>
              <Icon size={17} className={urgent && typeof value === 'number' && value > 0 ? 'text-amber-500' : ''} />
            </div>
            <p className="metric-value mt-4">{loading ? '—' : value}</p>
          </Link>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1fr_300px] gap-6">
        {/* Needs attention */}
        <section className="surface overflow-hidden">
          <div className="p-5 border-b flex justify-between items-center">
            <div>
              <h2 className="font-semibold">Needs your attention</h2>
              <p className="text-xs text-slate-500 mt-1">Resolve these before printing can proceed.</p>
            </div>
            <Link href="/shop/inbox" className="text-sm text-indigo-600 flex items-center gap-1">
              View all <ArrowUpRight size={15} />
            </Link>
          </div>
          {loading ? (
            <p className="p-8 text-slate-400 text-sm text-center">Loading…</p>
          ) : attention.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-3" />
              <h3 className="font-semibold text-slate-700">All caught up</h3>
              <p className="text-sm text-slate-400 mt-1">No orders need action right now.</p>
            </div>
          ) : (
            <div className="divide-y">
              {attention.slice(0, 8).map((o) => (
                <Link key={o.id} href={`/shop/orders/${o.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{o.fileName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {o.customerName} · {o.pages}p × {o.copies} · ₹{o.amount}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs rounded-md bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1">
                    {o.status.replaceAll('_', ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Print desk */}
          <section className="surface p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Print desk</h2>
              <Printer size={17} className="text-indigo-500" />
            </div>
            <dl className="text-sm space-y-3">
              <div className="flex justify-between">
                <dt className="text-slate-500">Computer</dt>
                <dd className={`font-medium flex items-center gap-1.5 ${agentOnline ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {agentOnline ? <><span className="w-2 h-2 rounded-full bg-emerald-500" /> Connected</> : <><WifiOff size={13} /> Offline</>}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Printers configured</dt>
                <dd className="font-medium">{config?.printers?.length ?? 0}</dd>
              </div>
              {config?.agentVersion && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Agent version</dt>
                  <dd className="text-slate-600 font-mono text-xs">{config.agentVersion}</dd>
                </div>
              )}
            </dl>
            <Link href="/shop/printers" className="btn-secondary w-full mt-4 !text-xs">
              Manage printers <ArrowUpRight size={13} />
            </Link>
          </section>

          {/* Upcoming pickups */}
          <section className="surface p-5">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold text-sm">Upcoming pickups</h2>
              <Link href="/shop/schedule" className="text-xs text-indigo-600">Schedule →</Link>
            </div>
            {active.length === 0 && readyOrders.length === 0 ? (
              <p className="text-xs text-slate-400">No active orders.</p>
            ) : (
              <div className="space-y-2">
                {[...readyOrders, ...active].slice(0, 5).map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 truncate max-w-[150px]">{o.fileName}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${o.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      {o.status === 'ready' ? 'Ready' : 'Printing'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick links */}
          <div className="surface px-5 py-4 text-sm text-slate-600 space-y-2">
            {[
              ['/shop/orders', 'All orders'],
              ['/shop/schedule', 'Pickup schedule'],
              ['/shop/pricing', 'Services & prices'],
              ['/shop/settings', 'Shop settings'],
            ].filter(([href]) => owner || !['/shop/settings','/shop/pricing'].includes(href)).map(([href, label]) => (
              <Link key={href} href={href} className="flex justify-between hover:text-indigo-600">
                <span>{label}</span><ArrowUpRight size={13} />
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
