'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, RefreshCw, Store, AlertTriangle, CheckCircle2,
  ChevronRight, WifiOff, PlusCircle, ArrowUpRight,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import toast from 'react-hot-toast';

const LIFECYCLE_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  testing: 'bg-blue-100 text-blue-700',
  setup_incomplete: 'bg-amber-100 text-amber-700',
  draft: 'bg-slate-100 text-slate-500',
  suspended: 'bg-rose-100 text-rose-700',
  paused: 'bg-orange-100 text-orange-700',
};

function ShopsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [shops, setShops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(statusFilter);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch('/api/admin/shops').then((r) => r.json());
      setShops(d.shops ?? []);
    } catch { toast.error('Could not load shops'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = shops
    .filter((s) => !filter || (s.lifecycleStatus ?? s.status ?? '') === filter)
    .filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q) || s.ownerName?.toLowerCase().includes(q) || s.subdomain?.toLowerCase().includes(q);
    });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const statuses = ['', 'active', 'testing', 'setup_incomplete', 'draft', 'suspended', 'paused'];

  return (
    <div className="p-5 md:p-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="page-heading">Shops directory</h1>
          <p className="text-sm text-slate-500 mt-1">{shops.length} shops registered on this platform.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/shops/new" className="btn-primary !py-2 !text-sm">
            <PlusCircle size={14} /> Add shop
          </Link>
          <button onClick={load} className="btn-secondary !py-2 !text-sm"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input className="input-field !pl-9 text-sm" placeholder="Search shops…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input-field text-sm" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {statuses.slice(1).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="text-left px-4 py-3">Shop</th>
              <th className="text-left px-4 py-3">Owner</th>
              <th className="text-left px-4 py-3">Plan</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Agent</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Loading…</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center">
                  <Store size={20} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400 text-sm">No shops found</p>
                </td></tr>
              ) : paginated.map((s) => {
                const status = s.lifecycleStatus ?? s.status ?? 'active';
                const agentOnline = s.agentConnected && s.agentLastSeen
                  ? Date.now() - new Date(s.agentLastSeen).getTime() < 60000
                  : s.agentConnected;
                return (
                  <tr key={s.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{s.name}</p>
                      {s.subdomain && <p className="text-xs text-slate-400">{s.subdomain}.yourdomain.com</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p>{s.ownerName}</p>
                      <p className="text-xs text-slate-400">{s.email}</p>
                    </td>
                    <td className="px-4 py-3 capitalize">{s.plan ?? 'free'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LIFECYCLE_COLORS[status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {agentOnline ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Online</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-slate-400"><WifiOff size={12} /> Offline</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {s.joinedAt ? new Date(s.joinedAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/shops/${s.id}`} className="p-1 text-slate-400 hover:text-indigo-600">
                        <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t text-sm">
            <span className="text-slate-500">{filtered.length} shops</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary !py-1 !px-3 !text-xs disabled:opacity-40">Prev</button>
              <span className="text-slate-400 px-2">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="btn-secondary !py-1 !px-3 !text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShopsPage() {
  return <Suspense><ShopsContent /></Suspense>;
}
