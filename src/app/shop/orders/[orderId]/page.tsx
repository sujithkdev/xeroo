'use client';
import KrishnaPaymentQR from '@/components/KrishnaPaymentQR';

import FulfilmentPanel from '@/components/FulfilmentPanel';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Printer,
  Clock, FileText, CreditCard, MapPin, Activity, RefreshCw,
  Loader2, MessageSquare, Edit2,
} from 'lucide-react';
import PickupManagement from '@/components/PickupManagement';
import { Order } from '@/lib/types';
import { apiFetch } from '@/lib/apiFetch';
import toast from 'react-hot-toast';

type Tab = 'overview' | 'documents' | 'production' | 'payment' | 'pickup' | 'activity';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: CheckCircle2 },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'production', label: 'Production', icon: Printer },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'pickup', label: 'Pickup', icon: Clock },
  { key: 'activity', label: 'Activity', icon: Activity },
];

const STATUS_MAP: Record<string, { bg: string; text: string }> = {
  waiting_cash: { bg: 'bg-amber-100', text: 'text-amber-700' },
  waiting_approval: { bg: 'bg-orange-100', text: 'text-orange-700' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  queued: { bg: 'bg-blue-100', text: 'text-blue-700' },
  printing: { bg: 'bg-blue-100', text: 'text-blue-700' },
  submitted: { bg: 'bg-violet-100', text: 'text-violet-700' },
  error: { bg: 'bg-rose-100', text: 'text-rose-700' },
  ready: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  completed: { bg: 'bg-green-100', text: 'text-green-700' },
  cancelled: { bg: 'bg-slate-100', text: 'text-slate-500' },
};

function statusChip(status: string) {
  const s = STATUS_MAP[status] ?? { bg: 'bg-slate-100', text: 'text-slate-500' };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.bg} ${s.text}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [actioning, setActioning] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [finishingConfirmed,setFinishingConfirmed]=useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  async function load() {
    try {
      const [res, cfg] = await Promise.all([
        apiFetch('/api/orders').then((r) => r.json()),
        apiFetch('/api/config').then((r) => r.json()),
      ]);
      const found = (res.orders ?? []).find((o: Order) => o.id === orderId);
      if (!found) { router.replace('/shop/orders'); return; }
      setOrder(found);
      setStaffNotes((found as any).staffNotes ?? '');
      setConfig(cfg);
    } catch {
      toast.error('Could not load order');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orderId]);

  async function doAction(status: string, extra: Record<string, any> = {}) {
    if (!order) return;
    setActioning(true);
    try {
      await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status, ...extra }),
      });
      toast.success(`Order updated: ${status.replaceAll('_', ' ')}`);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Action failed');
    } finally {
      setActioning(false);
    }
  }

  async function saveNotes() {
    try {
      await apiFetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order?.id, staffNotes }) });
      toast.success('Notes saved'); setEditingNotes(false); await load();
    } catch (e: any) { toast.error(e.message || 'Could not save notes'); }
  }

  if (loading) return (
    <div className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto text-slate-400" /></div>
  );
  if (!order) return null;

  const printers = config?.printers ?? [];

  return (
    <div className="p-5 md:p-8 max-w-4xl">
      {/* Breadcrumb */}
      <Link href="/shop/orders" className="text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1 mb-5">
        <ArrowLeft size={14} /> All orders
      </Link>

      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Order</p>
          <h1 className="text-xl font-bold text-slate-900 font-mono mt-0.5">{order.id}</h1>
          <div className="flex items-center gap-2 mt-2">
            {statusChip(order.status)}
            {order.isPaid ? (
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Paid</span>
            ) : (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Unpaid</span>
            )}
          </div>
        </div>
        <button onClick={load} className="btn-secondary !py-2 !text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <PickupManagement order={order} staff onChange={load} /><FulfilmentPanel key={order.id+order.status} order={order} onChange={load}/>

      {/* ── Action bar ── */}
      <div className="surface p-4 mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Actions</p>
        <div className="flex flex-wrap gap-2">

          {order.paymentMethod === 'upi_qr' && !order.isPaid && order.status === 'waiting_cash' && <KrishnaPaymentQR amountPaise={order.amountPaise ?? Math.round(order.amount * 100)} />}
          {order.status === 'waiting_cash' && (
            <button disabled={actioning} onClick={() => doAction('queued')}
              className="btn-primary !py-2 !text-sm flex items-center gap-1.5">
              <CheckCircle2 size={14} /> {order.paymentMethod === 'upi_qr' ? 'Confirm UPI receipt' : 'Record cash received & accept'}
            </button>
          )}

          {/* STEP 1 — Accept online-paid order */}
          {order.status === 'waiting_approval' && (order as any).quoteId && (
            <button disabled={actioning}
              onClick={() => doAction('queued')}
              className="btn-primary !py-2 !text-sm flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Accept &amp; add to queue
            </button>
          )}

          {/* STEP 1 — Accept legacy waiting_approval */}
          {order.status === 'waiting_approval' && !(order as any).quoteId && (
            <button disabled={actioning} onClick={() => doAction('queued')}
              className="btn-primary !py-2 !text-sm flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Accept &amp; queue
            </button>
          )}

          {/* STEP 2 — Mark ready for collection (after printing) */}
          {order.status === 'submitted' && (
            <button disabled={actioning}
              onClick={() => {
                if ((order as any).documents?.some((d: any) => d.finishing && d.finishing !== 'none') && !finishingConfirmed) {
                  toast.error('Confirm all finishing is complete before marking ready (check the checkbox below).');
                  return;
                }
                doAction('ready', { finishingConfirmed: true });
              }}
              className="btn-primary !py-2 !text-sm flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Mark ready for collection
            </button>
          )}

          {/* STEP 2 — Manual mark ready (queued but auto-print disabled) */}
          {order.status === 'queued' && (
            <button disabled={actioning}
              onClick={() => doAction('ready', { finishingConfirmed: true })}
              className="btn-primary !py-2 !text-sm flex items-center gap-1.5">
              <Printer size={14} /> Mark as printed &amp; ready
            </button>
          )}

          {/* STEP 3 — Mark collected */}
          {(order.status === 'ready' || order.status === 'completed') && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                className="input-field !py-2 !text-sm max-w-[160px] font-mono tracking-widest uppercase"
                placeholder="Enter pickup code"
                value={pickupCode}
                onChange={e => setPickupCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
              <button
                disabled={actioning || pickupCode.length < 4}
                onClick={() => doAction('collected', { pickupCode })}
                className="btn-primary !py-2 !text-sm flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Mark collected
              </button>
            </div>
          )}

          {/* Recovery — error state */}
          {order.status === 'error' && (
            <button disabled={actioning}
              onClick={() => doAction('queued')}
              className="btn-secondary !py-2 !text-sm flex items-center gap-1.5 text-amber-700">
              <AlertTriangle size={14} /> Retry print
            </button>
          )}

          {/* Cancel — available for most pre-collection states */}
          {['pending', 'waiting_cash', 'waiting_approval', 'paid', 'queued', 'error', 'failed'].includes(order.status) && (
            <button disabled={actioning} onClick={() => doAction('cancelled')}
              className="btn-secondary !py-2 !text-sm text-rose-700 hover:bg-rose-50 flex items-center gap-1.5">
              <XCircle size={14} /> Cancel order
            </button>
          )}

          {/* Finishing confirmation checkbox when needed */}
          {order.status === 'submitted' && (order as any).documents?.some((d: any) => d.finishing && d.finishing !== 'none') && (
            <label className="flex items-center gap-2 text-sm text-slate-600 w-full mt-1 cursor-pointer">
              <input type="checkbox" checked={finishingConfirmed} onChange={e => setFinishingConfirmed(e.target.checked)} />
              All requested finishing (staple / binding / lamination) is complete
            </label>
          )}

          {actioning && <Loader2 size={16} className="animate-spin text-slate-400 self-center" />}
        </div>

        {/* Context hint */}
        <p className="text-xs text-slate-400 mt-3">
          {order.status === 'waiting_cash' && 'Verify receipt of payment before accepting.'}
          {order.status === 'waiting_approval' && 'Review the document and settings in the Documents tab before accepting.'}
          {order.status === 'queued' && 'Print agent will pick this up automatically, or mark ready manually after printing.'}
          {order.status === 'submitted' && 'Printing is in progress or complete. Mark ready once the job is done and finishing applied.'}
          {(order.status === 'ready' || order.status === 'completed') && 'Ask the customer for their pickup code, enter it above, and mark collected.'}
          {order.status === 'error' && 'Check the Production tab for the error detail before retrying.'}
          {order.status === 'collected' && 'Order complete.'}
          {order.status === 'cancelled' && 'This order is cancelled. Issue a refund from the Payment tab if payment was received.'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="surface p-5">
            <h2 className="font-semibold mb-4">Order details</h2>
            <dl className="grid sm:grid-cols-2 gap-3 text-sm">
              {[
                ['Customer', order.customerName || 'Guest'],
                ['Phone', order.customerPhone],
                ['Created', new Date(order.createdAt).toLocaleString('en-IN')],
                ['Source', (order.source ?? 'web').toUpperCase()],
                ['Amount', `₹${order.amount?.toFixed(2)}`],
                ['Payment', order.isPaid ? 'Paid' : (order.paymentMethod === 'cash' ? 'Cash — not yet paid' : 'Unpaid')],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-slate-400 text-xs">{k as string}</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">{v as string}</dd>
                </div>
              ))}
            </dl>
          </div>
          {order.customerInstructions && (
            <div className="surface p-4 text-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Customer instructions</p>
              <p className="text-slate-700">{order.customerInstructions}</p>
            </div>
          )}
          <div className="surface p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Staff notes</p>
              <button onClick={() => setEditingNotes(!editingNotes)} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                <Edit2 size={11} /> {editingNotes ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingNotes ? (
              <div>
                <textarea className="input-field text-sm resize-none w-full" rows={3} value={staffNotes} onChange={(e) => setStaffNotes(e.target.value)} placeholder="Internal notes — not visible to customer" />
                <button onClick={saveNotes} className="btn-primary !py-1.5 !text-xs mt-2">Save notes</button>
              </div>
            ) : (
              <p className="text-sm text-slate-600">{staffNotes || <span className="text-slate-400">No staff notes</span>}</p>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="surface overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Print specification — fixed after order</p>
          </div>
          <div className="divide-y">
            {(order.documents ?? [{ fileUrl: order.fileUrl, fileName: order.fileName, pages: order.pages, copies: order.copies, colorMode: order.colorMode, paperSize: order.paperSize, duplex: order.duplex, finishing: (order as any).finishing, itemAmountPaise: order.amountPaise }]).map((d: any, i: number) => (
              <div key={i} className="px-5 py-4 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 break-all">{d.fileName ?? order.fileName}</p>
                    <p className="text-slate-500 mt-1 text-xs">
                      {d.pages ?? order.pages}p · {d.copies ?? order.copies} {(d.copies ?? order.copies) === 1 ? 'copy' : 'copies'} ·{' '}
                      {(d.colorMode ?? order.colorMode) === 'bw' ? 'B&W' : 'Colour'} · {d.paperSize ?? order.paperSize} ·{' '}
                      {(d.duplex ?? order.duplex) === 'simplex' ? 'Single-sided' : 'Double-sided'}
                      {d.finishing && d.finishing !== 'none' && ` · ${d.finishing}`}
                    </p>
                    {/* PDF action buttons */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {(d.fileUrl || order.fileUrl) && (
                        <>
                          <a
                            href={d.fileUrl || order.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                          >
                            <FileText size={12} /> Open PDF
                          </a>
                          <a
                            href={d.fileUrl || order.fileUrl}
                            download={d.fileName || order.fileName}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors"
                          >
                            ↓ Download
                          </a>
                        </>
                      )}
                      {d.pageRange && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                          Pages: {d.pageRange}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-semibold text-slate-700 shrink-0 text-sm">
                    ₹{d.itemAmountPaise ? (d.itemAmountPaise / 100).toFixed(2) : order.amount?.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t bg-slate-50 flex justify-between font-bold text-sm">
            <span>Total</span><span>₹{order.amount?.toFixed(2)}</span>
          </div>
          <div className="px-5 py-3 border-t">
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <AlertTriangle size={11} className="text-amber-500" />
              Document settings and price cannot be changed after ordering. Cancel and re-place to correct an error.
            </p>
          </div>
        </div>
      )}

      {tab === 'production' && (
        <div className="space-y-4">
          <div className="surface p-5">
            <h2 className="font-semibold mb-4">Printer assignment</h2>
            <div className="flex items-center gap-3">
              <select className="input-field text-sm max-w-xs"
                value={order.assignedPrinterId ?? ''}
                onChange={async (e) => {
                  try {
                    await apiFetch('/api/orders', {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: order.id, assignedPrinterId: e.target.value }),
                    });
                    toast.success('Printer assigned');
                    load();
                  } catch { toast.error('Could not assign printer'); }
                }}
              >
                <option value="">Auto-select</option>
                {printers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="surface p-5">
            <h2 className="font-semibold mb-3">Print attempts</h2>
            {!(order.printAttempts?.length) ? (
              <p className="text-sm text-slate-400">No print attempts recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {order.printAttempts!.map((a) => (
                  <div key={a.id} className="border rounded-lg p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{a.printerName}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.outcome === 'success' ? 'bg-emerald-100 text-emerald-700' : a.outcome === 'uncertain' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {a.outcome}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs mt-1">{new Date(a.startedAt).toLocaleString('en-IN')}</p>
                    {a.errorDetail && <p className="text-rose-600 text-xs mt-1">{a.errorDetail}</p>}
                    {a.reason && <p className="text-slate-500 text-xs mt-1">Reason: {a.reason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'payment' && (
        <div className="surface p-5 space-y-4">
          <h2 className="font-semibold">Payment details</h2>
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              ['Amount', `₹${order.amount?.toFixed(2)}`],
              ['Method', order.paymentMethod === 'cash' ? 'Cash at counter' : order.paymentMethod === 'upi_qr' ? 'UPI QR' : 'Online (Razorpay)'],
              ['Status', order.isPaid ? 'Paid' : 'Unpaid'],
              ['Payment ID', order.paymentId || '—'],
              ['Razorpay Order', order.razorpayOrderId || '—'],
              ['Refund', order.refundState || 'None'],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-slate-400 text-xs">{k as string}</dt>
                <dd className="font-medium text-slate-800 mt-0.5">{v as string}</dd>
              </div>
            ))}
          </dl>
          {!order.isPaid && order.paymentMethod === 'cash' && order.status === 'waiting_cash' && (
            <button disabled={actioning} onClick={() => doAction('queued')}
              className="btn-primary !py-2 !text-sm">
              <CheckCircle2 size={14} /> Record cash collected &amp; accept
            </button>
          )}
        </div>
      )}

      {tab === 'pickup' && (
        <div className="surface p-5 space-y-4 text-sm">
          <h2 className="font-semibold">Pickup information</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Requested pickup</p>
              <p className="font-medium text-slate-800">
                {(order as any).requestedPickupAt
                  ? new Intl.DateTimeFormat('en-IN', { timeZone: (order as any).timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date((order as any).requestedPickupAt))
                  : <span className="text-slate-400">Not specified</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Confirmed pickup</p>
              <p className={`font-medium ${(order as any).confirmedPickupAt ? 'text-emerald-700' : 'text-slate-400'}`}>
                {(order as any).confirmedPickupAt
                  ? new Intl.DateTimeFormat('en-IN', { timeZone: (order as any).timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date((order as any).confirmedPickupAt))
                  : 'Not yet confirmed'}
              </p>
            </div>
          </div>
          {(order as any).pickupNeedsReschedule && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              Pickup reservation expired after payment. Customer needs to request a new slot from their tracking page.
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Pickup code</p>
            <p className="font-mono text-2xl font-bold text-slate-800 tracking-widest">{order.pickupCode}</p>
            <p className="text-xs text-slate-400 mt-1">Customer shows this code when collecting. Verify before marking collected.</p>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="surface overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Activity log</p>
          </div>
          {!(order.activityLog?.length) ? (
            <div className="p-8 text-center text-sm text-slate-400">
              <Activity size={20} className="mx-auto mb-2 text-slate-300" />
              No activity recorded yet.
            </div>
          ) : (
            <div className="divide-y">
              {order.activityLog!.map((entry) => (
                <div key={entry.id} className="px-5 py-3.5 text-sm">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="font-medium text-slate-700">{entry.action}</span>
                      {entry.note && <p className="text-xs text-slate-500 mt-0.5">{entry.note}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleString('en-IN')}</p>
                      <p className="text-xs text-slate-400">{entry.actor}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
