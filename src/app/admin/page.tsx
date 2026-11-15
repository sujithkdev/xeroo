'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Store, AlertTriangle, WifiOff, RefreshCw, ArrowUpRight,
  Activity, CreditCard, CheckCircle2, Clock, Users,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';

export default function AdminOverview() {
  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    try {
      const d = await apiFetch('/api/admin/shops').then((r) => r.json());
      setShops(d.shops ?? []);
      setError('');
      setLastRefresh(new Date());
    } catch {
      setError('Could not load platform data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const active = shops.filter((s) => (s.lifecycleStatus ?? s.status) === 'active');
  const incomplete = shops.filter((s) => ['draft', 'setup_incomplete'].includes(s.lifecycleStatus ?? ''));
  const unavailable = shops.filter((s) => ['suspended', 'paused'].includes(s.lifecycleStatus ?? s.status ?? ''));
  const agentOffline = shops.filter((s) => !s.agentConnected);

  const incidents = [
    ...(agentOffline.length ? [{ type: 'agent', label: `${agentOffline.length} shop(s) with offline agent`, href: '/admin/shops' }] : []),
    ...(incomplete.length ? [{ type: 'setup', label: `${incomplete.length} shop(s) with incomplete setup`, href: '/admin/shops?status=setup_incomplete' }] : []),
    ...(unavailable.length ? [{ type: 'unavailable', label: `${unavailable.length} shop(s) currently unavailable`, href: '/admin/shops?status=suspended' }] : []),
  ];

  return (
    <div className="p-5 md:p-8 space-y-7">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="eyebrow !mb-2">PLATFORM ADMINISTRATION</p>
          <h1 className="page-heading">Platform overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            {shops.length} shop{shops.length !== 1 ? 's' : ''} · Last refreshed {lastRefresh.toLocaleTimeString('en-IN')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/shops/new" className="btn-primary !py-2 !text-sm">
            <Store size={14} /> Add shop
          </Link>
          <button onClick={load} className="btn-secondary !py-2 !text-sm">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Active shops', value: active.length, icon: CheckCircle2, href: '/admin/shops?status=active' },
          { label: 'Setup incomplete', value: incomplete.length, icon: Clock, href: '/admin/shops?status=setup_incomplete', urgent: incomplete.length > 0 },
          { label: 'Unavailable', value: unavailable.length, icon: AlertTriangle, href: '/admin/shops?status=suspended', urgent: unavailable.length > 0 },
          { label: 'Offline agents', value: agentOffline.length, icon: WifiOff, href: '/admin/shops', urgent: agentOffline.length > 0 },
        ].map(({ label, value, icon: Icon, href, urgent }) => (
          <Link key={label} href={href}
            className={`surface p-5 hover:border-indigo-300 transition-colors ${urgent && value > 0 ? 'border-amber-300 bg-amber-50/40' : ''}`}>
            <div className="flex items-center justify-between text-slate-500 text-sm">
              <span>{label}</span>
              <Icon size={17} className={urgent && value > 0 ? 'text-amber-500' : ''} />
            </div>
            <p className="metric-value mt-4">{loading ? '—' : value}</p>
          </Link>
        ))}
      </div>

      <div className="grid xl:grid-cols-[1fr_320px] gap-6">
        {/* Incidents */}
        <section className="surface overflow-hidden">
          <div className="p-5 border-b flex justify-between items-center">
            <h2 className="font-semibold">Actionable incidents</h2>
            <Link href="/admin/health" className="text-sm text-indigo-600 flex items-center gap-1">
              System health <ArrowUpRight size={14} />
            </Link>
          </div>
          {incidents.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
              <p className="text-slate-500 text-sm">No actionable incidents</p>
            </div>
          ) : (
            <div className="divide-y">
              {incidents.map((i, idx) => (
                <Link key={idx} href={i.href} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                    <span className="text-sm text-slate-700">{i.label}</span>
                  </div>
                  <ArrowUpRight size={14} className="text-slate-400 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          <section className="surface p-5">
            <h2 className="font-semibold mb-4 text-sm">Quick links</h2>
            <div className="space-y-2">
              {[
                ['/admin/shops', 'Shops directory', Store],
                ['/admin/users', 'Users & access', Users],
                ['/admin/subscriptions', 'Plans & billing', CreditCard],
                ['/admin/health', 'System health', Activity],
              ].map(([href, label, Icon]: any) => (
                <Link key={href} href={href}
                  className="flex items-center justify-between text-sm text-slate-600 hover:text-indigo-600 py-1.5">
                  <span className="flex items-center gap-2"><Icon size={14} />{label}</span>
                  <ArrowUpRight size={13} />
                </Link>
              ))}
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="font-semibold text-sm mb-3">Shops summary</h2>
            <dl className="text-sm space-y-2">
              {[
                ['Total shops', shops.length],
                ['Active', active.length],
                ['Testing / setup', incomplete.length],
                ['Suspended', unavailable.length],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <dt className="text-slate-500">{k as string}</dt>
                  <dd className="font-medium text-slate-800">{v as number}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
