'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, Filter, RefreshCw, ChevronRight, AlertTriangle,
  CheckCircle2, Clock, Printer, Package, ArrowUpRight,
} from 'lucide-react';
import { Order } from '@/lib/types';
import { apiFetch } from '@/lib/apiFetch';
import toast from 'react-hot-toast';
import { Suspense } from 'react';

const STATUS_TABS = [
  { key: 'attention', label: 'Needs attention', statuses: ['pending', 'waiting_cash', 'waiting_approval', 'error', 'failed', 'cancel_requested'] },
  { key: 'active', label: 'In progress', statuses: ['queued', 'printing', 'downloading', 'submitted', 'paid'] },
  { key: 'ready', label: 'Ready', statuses: ['ready', 'completed'] },
  { key: 'history', label: 'History', statuses: ['collected', 'cancelled'] },
];

const STATUS_COLORS: Record<string, string> = {
  waiting_cash: 'bg-amber-100 text-amber-700',
  waiting_approval: 'bg-orange-100 text-orange-700',
  error: 'bg-rose-100 text-rose-700',
  failed: 'bg-rose-100 text-rose-600',
  cancel_requested: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-700',
  queued: 'bg-blue-100 text-blue-700',
  printing: 'bg-blue-100 text-blue-700',
  downloading: 'bg-sky-100 text-sky-700',
  submitted: 'bg-violet-100 text-violet-700',
  ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-green-100 text-green-700',
  collected: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
  pending: 'bg-slate-100 text-slate-500',
};

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') || STATUS_TABS.find(t => t.statuses.includes(searchParams.get('status') || ''))?.key || 'attention';
  const statusParam = searchParams.get('status') || '';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(tabParam);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Track the last fetch time so incremental polls only download changed orders.
  const lastFetchRef = useRef<string | null>(null);

  const fetchOrders = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // On the first full load there's no since param — get everything.
      // On subsequent quiet polls, only fetch orders updated since last fetch.
      const since = quiet && lastFetchRef.current ? `?since=${encodeURIComponent(lastFetchRef.current)}` : '';
      // Record the timestamp BEFORE the fetch so we don't miss updates that
      // arrive while the request is in flight.
      const fetchedAt = new Date().toISOString();
      const res = await apiFetch(`/api/orders${since}`).then((r) => r.json());
      const incoming: Order[] = res.orders || [];
      lastFetchRef.current = fetchedAt;
      if (quiet && since) {
        // Merge: replace changed orders in place, append new ones.
        setOrders(prev => {
          const map = new Map(prev.map(o => [o.id, o]));
          for (const o of incoming) map.set(o.id, o);
          return Array.from(map.values());
        });
      } else {
        setOrders(incoming);
      }
      setError('');
    } catch {
      setError('Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const id = setInterval(() => fetchOrders(true), 6000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setActiveTab(tabParam);
    setPage(1);
  }, [tabParam]);

  const switchTab = (key: string) => {
    router.push(`/shop/orders?tab=${key}`, { scroll: false });
  };

  const tabDef = STATUS_TABS.find((t) => t.key === activeTab) ?? STATUS_TABS[0];

  const filtered = orders
    .filter((o) => tabDef.statuses.includes(o.status))
    .filter((o) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q) ||
        o.fileName?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const tabCounts = STATUS_TABS.map((t) => ({
    ...t,
    count: orders.filter((o) => t.statuses.includes(o.status)).length,
  }));

  const acceptOrder = async (orderId: string) => {
    try {
      await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: 'queued' }),
      });
      toast.success('Order accepted and queued');
      fetchOrders(true);
    } catch (e: any) {
      toast.error(e.message || 'Could not accept order');
    }
  };

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="page-heading">Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Daily workspace — all orders for this shop.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/shop/orders/new" className="btn-primary !py-2 !text-sm">
            <Package size={14} /> New counter order
          </Link>
          <button onClick={() => fetchOrders()} className="btn-secondary !py-2 !text-sm">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-5 overflow-x-auto">
        {tabCounts.map((t) => (
          <button key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          className="input-field !pl-9"
          placeholder="Search by name, phone, order ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 mb-4">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Documents</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Payment</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Loading orders…</td></tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <CheckCircle2 size={24} className="mx-auto text-emerald-400 mb-2" />
                    <p className="text-slate-500 text-sm">No orders in this view</p>
                  </td>
                </tr>
              ) : (
                paginated.map((o) => (
                  <tr key={o.id} className="border-b hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.id.slice(0, 16)}…</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{o.customerName || 'Guest'}</p>
                      <p className="text-xs text-slate-400">{o.customerPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="max-w-[160px] truncate">{o.fileName}</p>
                      <p className="text-xs text-slate-400">{o.pages}p × {o.copies} · {o.colorMode === 'bw' ? 'B&W' : 'Colour'}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">₹{o.amount?.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {o.isPaid ? 'Paid' : o.paymentMethod === 'cash' ? 'Cash due' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {o.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(o.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {['waiting_approval', 'waiting_cash', 'paid'].includes(o.status) && (
                          <button
                            onClick={() => acceptOrder(o.id)}
                            className="text-xs text-indigo-600 font-medium hover:underline"
                          >
                            Accept
                          </button>
                        )}
                        <Link href={`/shop/orders/${o.id}`}
                          className="p-1 text-slate-400 hover:text-indigo-600" aria-label="View order">
                          <ChevronRight size={15} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <span className="text-slate-500">{filtered.length} orders</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="btn-secondary !py-1 !px-3 !text-xs disabled:opacity-40">Prev</button>
              <span className="text-slate-500 px-2">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(page + 1)} className="btn-secondary !py-1 !px-3 !text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return <Suspense><OrdersContent /></Suspense>;
}
