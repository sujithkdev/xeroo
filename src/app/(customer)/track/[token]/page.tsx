'use client';
import KrishnaPaymentQR from '@/components/KrishnaPaymentQR';

import PickupManagement from '@/components/PickupManagement';
import Script from 'next/script';
import {payForOrder} from '@/lib/client-checkout';
import CustomerHeader from '@/components/CustomerHeader';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, Clock, Printer, Package, AlertTriangle,
  MapPin, Phone, Copy, RefreshCw, Info, ExternalLink, Loader2, XCircle,
} from 'lucide-react';

type Stage = 'submitted' | 'accepted' | 'preparing' | 'ready' | 'collected';

const STAGES: { key: Stage; label: string; desc: string }[] = [
  { key: 'submitted', label: 'Submitted', desc: 'Your order has been received.' },
  { key: 'accepted', label: 'Accepted', desc: 'Shop has reviewed and accepted your order.' },
  { key: 'preparing', label: 'Preparing', desc: 'Your documents are being printed.' },
  { key: 'ready', label: 'Ready', desc: 'Your order is ready for collection.' },
  { key: 'collected', label: 'Collected', desc: 'Order collected. Thank you!' },
];

function orderStatusToStage(status: string): Stage {
  const map: Record<string, Stage> = {
    pending: 'submitted', waiting_cash: 'submitted', waiting_approval: 'submitted',
    paid: 'accepted', queued: 'accepted',
    downloading: 'preparing', printing: 'preparing', submitted: 'preparing', error: 'preparing',
    ready: 'ready',
    completed: 'ready', collected: 'collected',
  };
  return map[status] ?? 'submitted';
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Payment pending', waiting_cash: 'Awaiting payment confirmation',
    waiting_approval: 'Awaiting approval', paid: 'Paid', queued: 'In queue',
    downloading: 'Downloading file', printing: 'Printing', submitted: 'Sent to printer',
    error: 'Print issue', ready: 'Ready for collection',
    completed: 'Ready for collection', collected: 'Collected', cancelled: 'Cancelled',
    cancel_requested: 'Cancellation requested', failed: 'Failed',
    refund_pending: 'Refund pending',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

function paymentLabel(order: any) {
  if (order.isPaid) return 'Paid';
  if (order.paymentMethod === 'upi_qr') return 'Awaiting UPI verification';
  if (order.paymentMethod === 'cash') return 'Pay at counter';
  return 'Unpaid';
}

export default function TrackPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchOrder = async (isManual = false) => {
    try {
      // Try to match by order ID or tracking token
      const res = await fetch(`/api/orders?token=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const found = (data.orders ?? []).find(
        (o: any) => o.id === token || o.trackingToken === token
      );
      if (found) {
        setOrder(found);
        setError('');
      } else {
        setOrder(null);
        setError('not_found');
      }
      setOffline(false);
      setLastRefresh(new Date());
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setConfig).catch(() => {
      // Config failed — payment retry will be disabled until it loads.
      // Non-fatal: order tracking still works without it.
    });
    fetchOrder();
  }, [token]);

  // Poll every 8s, stop for terminal states
  useEffect(() => {
    if (!order) return;
    const terminal = ['collected', 'cancelled', 'failed'];
    if (terminal.includes(order.status)) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => fetchOrder(), 8000);
    return () => clearInterval(intervalRef.current);
  }, [order?.status]);

  const shop = config?.shopSettings;
  const stage = order ? orderStatusToStage(order.status) : null;
  const stageIdx = stage ? STAGES.findIndex((s) => s.key === stage) : -1;
  const isCancelled = ['cancelled', 'cancel_requested', 'failed'].includes(order?.status);
  const isTerminal = ['collected', 'cancelled'].includes(order?.status);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50"><CustomerHeader />
      <div className="site-width py-20 text-center"><Loader2 size={24} className="animate-spin mx-auto text-slate-400" /></div>
    </div>
  );

  if (error === 'not_found') return (
    <div className="min-h-screen bg-slate-50"><CustomerHeader />
      <div className="site-width py-16 max-w-lg mx-auto text-center">
        <AlertTriangle size={36} className="mx-auto text-amber-400 mb-4" />
        <h1 className="text-xl font-semibold text-slate-800">Order not found</h1>
        <p className="text-slate-500 text-sm mt-3">
          This tracking link may have expired or the order ID is incorrect. Check your confirmation SMS or contact the shop.
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <Link href="/" className="btn-secondary !text-sm">Home</Link>
          <Link href="/track" className="btn-primary !text-sm">Search order</Link>
        </div>
      </div>
    </div>
  );

  if (!order) return <div className="min-h-screen bg-slate-50"><CustomerHeader /><main className="site-width py-12"><h1 className="page-heading">Could not load your order</h1><p className="my-4">Check your connection and try again.</p><button className="btn-primary" onClick={() => fetchOrder(true)}>Retry</button></main></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <CustomerHeader />
      <main className="site-width py-8 max-w-lg">

        {/* Offline indicator */}
        {offline && (
          <div role="status" className="mb-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            <AlertTriangle size={13} /> Offline — showing last refresh at {lastRefresh.toLocaleTimeString('en-IN')}
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">Order</p>
            <h1 className="text-xl font-bold text-slate-900 mt-0.5">{order?.id}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fetchOrder(true)} aria-label="Refresh" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700">
              <RefreshCw size={15} />
            </button>
            <button onClick={copyLink} aria-label="Copy tracking link" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700">
              {copied ? <CheckCircle2 size={15} className="text-emerald-500" /> : <Copy size={15} />}
            </button>
          </div>
        </div>

        {/* Newly placed — save link reminder */}
        {order?.createdAt && Date.now() - new Date(order.createdAt).getTime() < 120_000 && (
          <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-800">
            <p className="font-semibold">Order placed successfully!</p>
            <p className="mt-1 text-indigo-700">Save or bookmark this page to track your order. The link is private — don't share it.</p>
          </div>
        )}

        <PickupManagement order={order} onChange={() => fetchOrder(true)} />
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        {order && !order.isPaid && order.paymentMethod === 'online' && order.status === 'pending' && (
          <button
            className="btn-primary my-4"
            disabled={!config}
            title={!config ? 'Loading shop settings…' : undefined}
            onClick={async () => {
              try {
                await payForOrder(order, config);
                await fetchOrder(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Payment failed');
              }
            }}
          >
            {config ? 'Retry payment for this order' : 'Loading…'}
          </button>
        )}
        {error && error !== 'not_found' && <p role="alert" className="text-rose-700 my-4">{error}</p>}
        {/* Progress tracker */}
        {!isCancelled && order && (
          <div className="surface p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Progress</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${order.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {statusLabel(order.status)}
              </span>
            </div>
            <div className="relative mt-4">
              <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-200" />
              <div
                className="absolute top-4 left-0 h-0.5 bg-indigo-500 transition-all duration-700"
                style={{ width: `${stageIdx >= 0 ? (stageIdx / (STAGES.length - 1)) * 100 : 0}%` }}
              />
              <div className="relative flex justify-between">
                {STAGES.map((s, i) => (
                  <div key={s.key} className="flex flex-col items-center gap-1.5" style={{ width: '20%' }}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors z-10 bg-white
                      ${i < stageIdx ? 'border-indigo-500 bg-indigo-500 text-white' :
                        i === stageIdx ? 'border-indigo-500 text-indigo-600' :
                        'border-slate-200 text-slate-300'}`}
                    >
                      {i < stageIdx ? <CheckCircle2 size={14} /> : <span className="text-xs font-bold">{i + 1}</span>}
                    </div>
                    <span className={`text-[10px] text-center leading-tight font-medium ${i <= stageIdx ? 'text-slate-700' : 'text-slate-300'}`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {stage && (
              <p className="text-xs text-slate-500 mt-4 text-center">{STAGES[stageIdx]?.desc}</p>
            )}
          </div>
        )}

        {/* Cancelled */}
        {isCancelled && (
          <div className="surface p-5 mb-4 border-rose-200">
            <div className="flex items-center gap-2 text-rose-700 mb-2">
              <XCircle size={18} /> <p className="font-semibold">Order {statusLabel(order.status)}</p>
            </div>
            {order.refundState && (
              <p className="text-sm text-slate-600 mt-2">
                Refund: <span className="font-medium capitalize">{order.refundState.replace('_', ' ')}</span>
              </p>
            )}
          </div>
        )}

        {order?.paymentMethod === 'upi_qr' && !order.isPaid && order.status === 'waiting_cash' && <KrishnaPaymentQR amountPaise={order.amountPaise ?? Math.round(order.amount * 100)} />}
        <div className="surface p-4 mb-4 flex justify-between items-center text-sm">
          <span className="text-slate-500">Payment</span>
          <span className={`font-semibold ${order?.isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
            {order ? paymentLabel(order) : '—'}
          </span>
        </div>

        {/* Pickup */}
        <div className="surface p-4 mb-4 text-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Pickup</p>
          {order?.confirmedPickupAt ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-700">Confirmed: {new Intl.DateTimeFormat('en-IN', { timeZone: order.timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.confirmedPickupAt))}</p>
                <p className="text-xs text-slate-400 mt-0.5">Your actual confirmed collection time.</p>
              </div>
            </div>
          ) : order?.requestedPickupAt ? (
            <div className="flex items-start gap-2">
              <Clock size={15} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-700">Requested: {new Intl.DateTimeFormat('en-IN', { timeZone: order.timezone || 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.requestedPickupAt))}</p>
                <p className="text-xs text-slate-400 mt-0.5">Awaiting staff confirmation.</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-400">Not yet assigned</p>
          )}
        </div>

        {/* Pickup code */}
        {(order?.status === 'ready' || order?.status === 'completed') && order.pickupCode && (
          <div className="surface p-5 mb-4 text-center border-emerald-200 bg-emerald-50">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Show this at the counter</p>
            <p className="text-4xl font-bold tracking-widest text-emerald-800 font-mono">{order.pickupCode}</p>
            <p className="text-xs text-emerald-600 mt-2">Your pickup code</p>
          </div>
        )}

        {/* Documents */}
        {order && (
          <div className="surface p-4 mb-4 text-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Documents</p>
            <div className="space-y-1">
              {order.documents ? order.documents.map((d: any) => (
                <div key={d.id} className="flex justify-between text-slate-600">
                  <span className="truncate max-w-[200px]">{d.fileName}</span>
                  <span>{d.pages} pages × {d.copies}</span>
                </div>
              )) : (
                <div className="flex justify-between text-slate-600">
                  <span className="truncate max-w-[200px]">{order.fileName}</span>
                  <span>{order.pages} pages × {order.copies}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between font-semibold mt-3 pt-3 border-t">
              <span>Total</span>
              <span>₹{order.amount?.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Shop contact */}
        {shop && (
          <div className="surface p-4 mb-4 text-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Shop contact</p>
            <p className="font-semibold text-slate-700">{shop.name}</p>
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-2 text-slate-500">
                <MapPin size={13} className="mt-0.5 shrink-0" />
                <span>{shop.address}</span>
              </div>
              {shop.phone && (
                <div className="flex gap-2 text-slate-500">
                  <Phone size={13} className="mt-0.5 shrink-0" />
                  <a href={`tel:${shop.phone}`} className="hover:text-indigo-600">{shop.phone}</a>
                </div>
              )}
            </div>
            {shop.googleMapsUrl && (
              <a href={shop.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-600 font-medium hover:underline">
                Get directions <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}

        {/* Help */}
        <div className="text-center text-sm text-slate-400 mt-6 space-y-2">
          <p>Having trouble? <Link href="/help" className="text-indigo-600 hover:underline">Visit the help page</Link> or call the shop.</p>
          {!isTerminal && (
            <p className="text-xs">Last refreshed {lastRefresh.toLocaleTimeString('en-IN')} · Auto-refreshes every 8 seconds</p>
          )}
        </div>
      </main>
    </div>
  );
}
