'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Search, AlertTriangle, CheckCircle2, ArrowUpRight, Loader2 } from 'lucide-react';
import { Order } from '@/lib/types';
import { apiFetch } from '@/lib/apiFetch';
import {receiptTime,shopDate} from '@/lib/daily-collections';
import toast from 'react-hot-toast';
import {canRequestRefund,refundRequest} from '@/lib/refunds';

type PaymentTab = 'online' | 'cash' | 'pending' | 'refunds';

const TABS: { key: PaymentTab; label: string }[] = [
  { key: 'online', label: 'Online payments' },
  { key: 'cash', label: 'Cash collected' },
  { key: 'pending', label: 'Pending' },
  { key: 'refunds', label: 'Refunds' },
];

export default function PaymentsPage() {
  const [zone,setZone]=useState('Asia/Kolkata');
  const [refundsAvailable,setRefundsAvailable]=useState(false);
  const [cashReturned,setCashReturned]=useState(false);
  const [loadError,setLoadError]=useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PaymentTab>('online');
  const [search, setSearch] = useState('');
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundTarget, setRefundTarget] = useState<Order | null>(null);

  async function load() {
    setLoading(true);setLoadError('');
    try {
      const [d,c]=await Promise.all([apiFetch('/api/orders').then(r=>r.json()),apiFetch('/api/config').then(r=>r.json())]);
      setZone(c.shopSettings?.timezone || 'Asia/Kolkata');
      setRefundsAvailable(c.capabilities?.refunds===true);
      setOrders(d.orders ?? []);
    } catch { setLoadError('Could not load payments. Please retry.');setRefundsAvailable(false); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const allPaid = orders.filter((o) => o.isPaid);
  const online = allPaid.filter((o) => o.paymentMethod !== 'cash');
  const cash = allPaid.filter((o) => o.paymentMethod === 'cash');
  const pending = orders.filter((o) => !o.isPaid && o.status !== 'cancelled' && o.status !== 'failed');
  const refunds = orders.filter((o) => o.refundState);

  const listMap: Record<PaymentTab, Order[]> = { online, cash, pending, refunds };
  const filtered = listMap[tab].filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return o.id.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q) || o.customerPhone?.includes(q);
  });

  const todayCash = cash.filter((o) => !o.synthetic && !!receiptTime(o) && shopDate(receiptTime(o)!,zone) === shopDate(new Date(),zone));
  const todayOnline = online.filter((o) => !o.synthetic && !!receiptTime(o) && shopDate(receiptTime(o)!,zone) === shopDate(new Date(),zone));

  async function processRefund() {
    if (!refundsAvailable || !refundTarget || !refundReason.trim()) { toast.error('Please enter a reason'); return; }
    setRefunding(refundTarget.id);
    try {
      await apiFetch('/api/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refundRequest(refundTarget,refundReason,cashReturned)),
      });
      toast.success(refundTarget.paymentMethod==='cash'?'Cash return recorded':'Refund requested');
      setCashReturned(false);
      setRefundTarget(null);
      setRefundReason('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Refund failed');
    } finally {
      setRefunding(null);
    }
  }

  return (
    <div className="p-5 md:p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="page-heading">Payments</h1>
          <p className="text-sm text-slate-500 mt-1">Confirmed payments, cash collections and refunds.</p>
        </div>
        <button onClick={load} className="btn-secondary !py-2 !text-sm"><RefreshCw size={14} /></button>
      </div>

      {loadError&&<p role="alert" className="mb-4 text-rose-700">{loadError}</p>}
      {!loading&&!loadError&&!refundsAvailable&&<p className="mb-4 text-sm text-amber-800">Refund processing is unavailable in this workspace. Contact the shop owner to arrange and reconcile refunds.</p>}
      {/* Summary */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Today's online", value: `₹${todayOnline.reduce((s, o) => s + o.amount, 0).toFixed(2)}`, sub: `${todayOnline.length} transactions` },
          { label: "Today's cash", value: `₹${todayCash.reduce((s, o) => s + o.amount, 0).toFixed(2)}`, sub: `${todayCash.length} collections` },
          { label: 'Pending', value: pending.length.toString(), sub: 'orders awaiting payment', urgent: pending.length > 0 },
        ].map(({ label, value, sub, urgent }) => (
          <div key={label} className={`surface p-4 ${urgent ? 'border-amber-200 bg-amber-50/30' : ''}`}>
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t.label}
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
              {listMap[t.key].length}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input className="input-field !pl-9 text-sm" placeholder="Search by name, ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500">
              <th className="text-left px-4 py-3">Order</th>
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-left px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Method</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="px-4 py-3" />
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center">
                  <CheckCircle2 size={20} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400 text-sm">No records in this view</p>
                </td></tr>
              ) : filtered.map((o) => (
                <tr key={o.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{o.id.slice(0, 14)}…</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{o.customerName || 'Guest'}</p>
                    <p className="text-xs text-slate-400">{o.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold">₹{o.amount?.toFixed(2)}</td>
                  <td className="px-4 py-3 capitalize">{o.paymentMethod === 'cash' ? 'Cash' : o.paymentMethod === 'upi_qr' ? 'UPI QR' : 'Online'}</td>
                  <td className="px-4 py-3">
                    {o.isPaid && !o.refundState ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Paid</span>
                    ) : o.refundState ? (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium capitalize">{o.refundState.replace('_', ' ')}</span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Unpaid</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(o.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 items-center">
                      <Link href={`/shop/orders/${o.id}`} className="text-xs text-indigo-600 hover:underline">View</Link>
                      {refundsAvailable && canRequestRefund(o) && (
                        <button onClick={() => {setCashReturned(false);setRefundReason('');setRefundTarget(o);}} className="text-xs text-rose-600 hover:underline">Refund</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refund dialog */}
      {refundTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="font-semibold text-lg mb-1">Initiate refund</h2>
            <p className="text-sm text-slate-500 mb-4">
              Order <span className="font-mono">{refundTarget.id.slice(0, 14)}</span> · ₹{refundTarget.amount?.toFixed(2)} · {refundTarget.paymentMethod}
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-4 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              {refundTarget.paymentMethod === 'cash'
                ? 'Cash refund: confirm you have physically returned the cash to the customer.'
                : 'Online refund: this will request a refund via Razorpay. The payment provider determines processing time.'}
            </div>
            {refundTarget.paymentMethod==='cash'&&<label className="flex gap-2 text-sm mb-4"><input type="checkbox" checked={cashReturned} onChange={e=>setCashReturned(e.target.checked)}/>I have returned the cash to the customer.</label>}
            <label className="block text-xs font-medium text-slate-600 mb-1">Reason *</label>
            <textarea className="input-field text-sm w-full resize-none" rows={2} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Enter reason for refund…" />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRefundTarget(null); setRefundReason(''); }} className="btn-secondary flex-1">Cancel</button>
              <button onClick={processRefund} disabled={!!refunding || !refundReason.trim() || (refundTarget.paymentMethod==='cash'&&!cashReturned)} className="btn-primary flex-1 !bg-rose-600 hover:!bg-rose-700">
                {refunding ? <Loader2 size={15} className="animate-spin" /> : null}
                Confirm refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
