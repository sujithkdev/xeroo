'use client';
import { apiFetch } from '@/lib/apiFetch';

import { useState, useEffect, useRef } from 'react';
import {
  Search, Printer, CheckCircle, XCircle, RotateCcw,
  Clock, MessageSquare, Globe, Phone, Copy,
  RefreshCw, Package, X, Edit2, Trash2,
  FileText, AlertTriangle, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr), now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function ageLabel(dateStr?: string): { text: string; old: boolean } {
  if (!dateStr) return { text: '', old: false };
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  const old = mins >= 15;
  const text = mins < 1 ? 'Just now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;
  return { text, old };
}

// ─── Status config ────────────────────────────────────────────────────────────

const S: Record<string, { label: string; dot: string; chip: string; border: string }> = {
  error:            { label: 'Error',        dot: 'bg-rose-500',              chip: 'bg-rose-100 text-rose-700',      border: 'border-l-rose-500' },
  waiting_approval: { label: 'Needs Approval', dot: 'bg-orange-400',           chip: 'bg-orange-100 text-orange-700',  border: 'border-l-orange-400' },
  waiting_cash:     { label: 'Payment due',     dot: 'bg-amber-400',             chip: 'bg-amber-100 text-amber-700',    border: 'border-l-amber-400' },
  paid:             { label: 'Paid ✓',       dot: 'bg-emerald-500',           chip: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-500' },
  queued:           { label: 'In Queue',     dot: 'bg-blue-500',              chip: 'bg-blue-100 text-blue-700',      border: 'border-l-blue-500' },
  printing:         { label: 'Printing…',   dot: 'bg-brand-500 animate-pulse', chip: 'bg-brand-100 text-brand-700',  border: 'border-l-brand-500' },
  downloading:      { label: 'Downloading', dot: 'bg-sky-400 animate-pulse',  chip: 'bg-sky-100 text-sky-700',        border: 'border-l-sky-400' },
  submitted: { label: 'Check printed output', dot: 'bg-violet-500', chip: 'bg-violet-100 text-violet-700', border: 'border-l-violet-400' },
  ready: { label: 'Ready', dot: 'bg-green-500', chip: 'bg-green-100 text-green-700', border: 'border-l-green-200' },
  collected: { label: 'Collected', dot: 'bg-slate-500', chip: 'bg-slate-100 text-slate-700', border: 'border-l-slate-200' },
  completed:        { label: 'Ready',      dot: 'bg-green-500',             chip: 'bg-green-100 text-green-700',    border: 'border-l-slate-200' },
  pending:          { label: 'Unpaid',       dot: 'bg-slate-400',             chip: 'bg-slate-100 text-slate-600',    border: 'border-l-slate-300' },
  cancelled:        { label: 'Cancelled',   dot: 'bg-slate-300',             chip: 'bg-slate-100 text-slate-400',    border: 'border-l-slate-200' },
  failed:           { label: 'Failed',       dot: 'bg-rose-400',              chip: 'bg-rose-100 text-rose-600',      border: 'border-l-rose-300' },
};
const getS = (status: string) => S[status] ?? { label: status, dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600', border: 'border-l-slate-200' };

// ─── Urgency sort ─────────────────────────────────────────────────────────────

function urgencyScore(o: any) {
  const m: Record<string, number> = { error: 0, waiting_approval: 1, waiting_cash: 2, paid: 3, queued: 4, printing: 5, downloading: 6, pending: 7, completed: 90, cancelled: 91, failed: 92 };
  return m[o.status] ?? 50;
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',      label: 'All' },
  { key: 'action',   label: '🔴 Action' },
  { key: 'active',   label: 'Active' },
  { key: 'done',     label: 'Done' },
];

function matchTab(o: any, tab: string) {
  if (tab === 'all')    return true;
  if (tab === 'action') return ['submitted', 'error', 'waiting_approval', 'waiting_cash', 'paid'].includes(o.status);
  if (tab === 'active') return ['paid', 'queued', 'printing', 'downloading'].includes(o.status);
  if (tab === 'done')   return ['ready', 'collected', 'completed', 'cancelled', 'failed', 'error'].includes(o.status);
  return true;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InboxPage() {
  const [orders, setOrders]     = useState<any[]>([]);
  const [printers, setPrinters] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [search, setSearch]     = useState('');
  const [tab, setTab]           = useState('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  // Edit modal state
  const [editOpen, setEditOpen]   = useState(false);
  const [eColor, setEColor]       = useState('bw');
  const [eDuplex, setEDuplex]     = useState('simplex');
  const [ePaper, setEPaper]       = useState('A4');
  const [eCopies, setECopies]     = useState(1);
  const [ePrinter, setEPrinter]   = useState('');

  const prevIds  = useRef<Set<string>>(new Set());
  const audioRef = useRef<AudioContext | null>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Audio alert ──────────────────────────────────────────────────────────────
  const ding = () => {
    try {
      const ctx = audioRef.current || new AudioContext();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.2);
      g.gain.setValueAtTime(0.4, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  };

  // ── Load data ────────────────────────────────────────────────────────────────
  const load = () => {
    apiFetch('/api/orders').then(r => r.json()).then(d => {
      if (!d?.orders) return;
      const sorted = [...d.orders].sort((a, b) => {
        const sd = urgencyScore(a) - urgencyScore(b);
        return sd !== 0 ? sd : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      // New order alert
      const newPaid = sorted.filter(o =>
        ['paid', 'waiting_cash', 'waiting_approval'].includes(o.status) &&
        !prevIds.current.has(o.id)
      );
      if (newPaid.length > 0 && prevIds.current.size > 0) {
        ding();
        toast(`🔔 ${newPaid.length} new order${newPaid.length > 1 ? 's' : ''}!`, {
          duration: 4000, style: { background: '#7c3aed', color: '#fff', fontWeight: 700 }
        });
        if ('Notification' in window && Notification.permission === 'granted') {
          newPaid.forEach(o => new Notification(`New: ${o.customerName}`, {
            body: `${o.fileName} · ₹${o.amount}`, icon: '/favicon.ico', tag: o.id
          }));
        }
      }
      sorted.forEach(o => prevIds.current.add(o.id));

      // Tab title badge
      const actionCount = sorted.filter(o => ['error', 'waiting_approval', 'waiting_cash', 'paid'].includes(o.status)).length;
      document.title = actionCount > 0 ? `(${actionCount}) Order Inbox` : 'Order Inbox';

      setOrders(sorted);
      setSelected((prev: any) => prev ? (sorted.find(o => o.id === prev.id) ?? prev) : null);
      localStorage.setItem('printOrders', JSON.stringify(sorted));
    }).catch(() => {
      const s = localStorage.getItem('printOrders');
      if (s) try { setOrders(JSON.parse(s)); } catch (e) {}
    });

    apiFetch('/api/config').then(r => r.json()).then(d => {
      if (d?.printers) setPrinters(d.printers);
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 3500);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();

    // Keyboard shortcuts
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      setSelected((cur: any) => {
        if (!cur) return cur;
        if ((e.key === 'p' || e.key === 'P') && ['paid', 'queued'].includes(cur.status)) {
          doStatus(cur.id, 'queued', `⌨️ [P] ${cur.id} → print queue`);
        }
        if ((e.key === 'c' || e.key === 'C') && !['ready', 'collected', 'completed', 'cancelled', 'failed'].includes(cur.status)) {
          if (confirm(`Cancel ${cur.id}?`)) doStatus(cur.id, 'cancelled', `⌨️ [C] ${cur.id} cancelled`);
        }
        return cur;
      });
      if (e.key === 'n' || e.key === 'N') {
        setOrders(os => {
          setSelected((cur: any) => {
            const idx = cur ? os.findIndex((o: any) => o.id === cur.id) : -1;
            const next = os[idx + 1] ?? os[0];
            setSheetOpen(true);
            return next ?? cur;
          });
          return os;
        });
      }
      if (e.key === 'Escape') { setSelected(null); setSheetOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener('keydown', onKey);
      document.title = 'Shop Panel';
    };
  }, []);

  // ── Status update helper ──────────────────────────────────────────────────────
  const doStatus = async (id: string, status: string, msg?: string) => {
    try {
      const res = await apiFetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Update rejected');
      toast.success(msg || `${id} → ${status}`);
      load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); }
  };

  const doDelete = async (id: string) => {
    if (!confirm(`Delete order ${id} permanently?`)) return;
    try {
      await apiFetch(`/api/orders?id=${id}`, { method: 'DELETE' });
      toast.success(`Order ${id} deleted.`);
      if (selected?.id === id) { setSelected(null); setSheetOpen(false); }
      load();
    } catch { toast.error('Delete failed.'); }
  };

  const openEdit = (o: any) => {
    setEColor(o.colorMode || 'bw'); setEDuplex(o.duplex || 'simplex');
    setEPaper(o.paperSize || 'A4'); setECopies(o.copies || 1);
    setEPrinter(o.assignedPrinterId || ''); setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!selected) return;
    const tid = toast.loading('Saving…');
    try {
      const r = await apiFetch('/api/orders', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, colorMode: eColor, duplex: eDuplex, paperSize: ePaper, copies: eCopies, assignedPrinterId: ePrinter }) });
      const d = await r.json();
      if (d.success) { toast.success('Saved!', { id: tid }); setEditOpen(false); load(); }
      else toast.error(d.error || 'Failed', { id: tid });
    } catch { toast.error('Network error.', { id: tid }); }
  };

  const copy = (text: string, label: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied!`));

  const getPrinterName = (id?: string) =>
    id ? (printers.find(p => p.id === id)?.name || 'Auto') : 'Auto';

  // ── Filtered list ─────────────────────────────────────────────────────────────
  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return (!q ||
      o.id?.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.customerPhone?.replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
      o.fileName?.toLowerCase().includes(q)
    ) && matchTab(o, tab);
  });

  const tabCount = (key: string) => orders.filter(o => matchTab(o, key)).length;

  // ── Select helper ─────────────────────────────────────────────────────────────
  const select = (o: any) => { setSelected(o); setSheetOpen(true); };

  // ─────────────────────────────────────────────────────────────────────────────
  // ORDER ROW — clean, compact, one-tap to open detail
  // ─────────────────────────────────────────────────────────────────────────────
  const OrderRow = ({ o }: { o: any }) => {
    const s       = getS(o.status);
    const isActive = selected?.id === o.id;
    const age     = ageLabel(o.createdAt);
    const isOld   = age.old && !['ready', 'collected', 'completed', 'cancelled', 'failed'].includes(o.status);

    return (
      <button
        onClick={() => select(o)}
        className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-slate-100 border-l-4 transition-all
          ${s.border}
          ${isActive ? 'bg-brand-50' : isOld ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'bg-white hover:bg-slate-50'}
        `}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
          {(o.customerName || '?').charAt(0).toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: name + amount */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-slate-900 text-xs truncate">{o.customerName || 'Unknown'}</span>
            <span className="font-black text-brand-600 text-xs flex-shrink-0">₹{o.amount}</span>
          </div>
          {/* Row 2: file + specs */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
            <span className="text-[10px] text-slate-500 truncate">{o.fileName}</span>
          </div>
          {/* Row 3: status chip + age */}
          <div className="flex items-center justify-between mt-1 gap-2">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${s.chip}`}>
              {s.label}
            </span>
            <span className={`text-[9px] font-bold flex-shrink-0 ${age.old ? 'text-amber-600' : 'text-slate-400'}`}>
              {age.text}
            </span>
          </div>
        </div>

        <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
      </button>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DETAIL PANEL — primary action at top, specs below, secondary at bottom
  // ─────────────────────────────────────────────────────────────────────────────
  const DetailPanel = ({ o }: { o: any }) => {
    const s           = getS(o.status);
    const canPrint    = ['paid', 'queued'].includes(o.status);
    const canApprove  = o.status === 'waiting_approval';
    const canCash     = o.status === 'waiting_cash';
    const canReprint  = o.status === 'error';
    const hasError    = o.status === 'error';
    const canCancel   = !['ready', 'collected', 'completed', 'cancelled', 'failed'].includes(o.status);
    const age         = ageLabel(o.createdAt);

    return (
      <div className="flex flex-col h-full bg-slate-50">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-white border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            {/* Close button (mobile) */}
            <button
              onClick={() => { setSelected(null); setSheetOpen(false); }}
              className="lg:hidden p-1.5 -ml-1 mt-0.5 text-slate-400 hover:text-slate-700 flex-shrink-0"
            >
              <X size={18} />
            </button>

            {/* Avatar */}
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
              {(o.customerName || '?').charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-black text-slate-900 text-sm truncate">{o.customerName}</h2>
                <span className="font-black text-brand-600 text-xl flex-shrink-0">₹{o.amount}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.chip}`}>{s.label}</span>
                <span className="text-[10px] text-slate-400 font-mono">{o.id}</span>
                {o.source === 'whatsapp'
                  ? <MessageSquare size={11} className="text-green-500" />
                  : <Globe size={11} className="text-blue-400" />
                }
                {age.old && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                    ⏰ {age.text} — waiting
                  </span>
                )}
              </div>
              {/* Phone */}
              <button
                onClick={() => copy(o.customerPhone, 'Phone')}
                className="flex items-center gap-1 mt-1.5 text-[11px] text-slate-500 hover:text-slate-700 font-medium"
              >
                <Phone size={11} />
                {o.customerPhone}
                <Copy size={9} className="text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        {/* ── PRIMARY ACTION — always visible, right at top ────────────────── */}
        <div className="flex-shrink-0 px-5 pt-4 pb-3 space-y-2.5">
          {canPrint && (
            <button
              onClick={() => doStatus(o.id, 'queued', `📤 Order ${o.id} sent to print queue!`)}
              className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[.98] text-white font-black text-base py-4 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-brand-600/30 transition-all"
            >
              <Printer size={22} />
              PRINT NOW
              <span className="text-brand-300 text-xs font-bold ml-1">[P]</span>
            </button>
          )}
          {canApprove && (
            <button
              onClick={() => doStatus(o.id, 'queued', `✅ Order ${o.id} approved!`)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-[.98] text-white font-black text-base py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <CheckCircle size={22} /> APPROVE & PRINT
            </button>
          )}
          {canCash && (
            <button
              onClick={() => doStatus(o.id, 'queued', `💰 Payment confirmed — ${o.id} queued!`)}
              className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[.98] text-white font-black text-base py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-amber-500/20 transition-all"
            >
              <Package size={22} /> {o.paymentMethod === 'upi_qr' ? 'CONFIRM UPI RECEIPT' : 'COLLECT CASH & PRINT'}
            </button>
          )}
          {hasError && (
            <button
              onClick={() => doStatus(o.id, 'queued', `🔄 Retrying ${o.id}`)}
              className="w-full bg-rose-500 hover:bg-rose-600 active:scale-[.98] text-white font-black text-base py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-rose-500/20 transition-all"
            >
              <RefreshCw size={20} /> RETRY PRINT
            </button>
          )}
          {canReprint && (
            <button
              onClick={() => doStatus(o.id, 'queued', `🔁 ${o.id} re-queued`)}
              className="w-full bg-slate-700 hover:bg-slate-800 active:scale-[.98] text-white font-bold text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2.5 transition-all"
            >
              <RotateCcw size={18} /> Reprint
            </button>
          )}
          {o.status === 'printing' && (
            <div className="w-full bg-brand-50 border-2 border-brand-200 text-brand-700 font-bold text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2.5">
              <Printer size={18} className="animate-pulse" /> Printing in progress…
            </div>
          )}
          {o.status === 'submitted' && <button className="w-full bg-green-600 text-white rounded-xl p-3 font-bold" onClick={() => doStatus(o.id,'ready','Physical output confirmed. Ready for pickup.')}>Confirm printed output</button>}
          {['ready', 'completed'].includes(o.status) && (
            <div className="w-full bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Pickup Code</p>
                <p className="text-emerald-800 font-black text-3xl tracking-[0.2em] mt-0.5">{o.pickupCode}</p>
              </div>
              <button
                onClick={() => copy(o.pickupCode, 'Pickup code')}
                className="p-2.5 bg-emerald-100 hover:bg-emerald-200 rounded-xl text-emerald-600 transition-all"
              >
                <Copy size={16} />
              </button>
            </div>
          )}
        </div>

        <Link href={'/shop/orders/' + o.id} className="mx-5 mb-3 text-sm font-semibold text-indigo-600">Open order details / confirm collection →</Link>
        {/* ── ORDER SPEC CARD ──────────────────────────────────────────────── */}
        <div className="flex-shrink-0 mx-5 mb-3 bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
          {/* File name bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <FileText size={13} className="text-brand-500 flex-shrink-0" />
            <span className="font-bold text-slate-700 text-xs truncate flex-1">{o.fileName}</span>
            <span className="text-[10px] text-slate-400 flex-shrink-0">{o.fileSize} MB</span>
          </div>

          {/* Specs row — single line, all key info */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <SpecBadge label={o.paperSize} />
              <SpecBadge label={o.colorMode === 'color' ? '🎨 Color' : '⬛ B&W'} />
              <SpecBadge label={`${o.pages}p × ${o.copies}`} />
              <SpecBadge label={o.duplex === 'duplex' ? 'Double-sided' : 'Single-sided'} />
              <SpecBadge label={`🖨️ ${getPrinterName(o.assignedPrinterId)}`} muted />
            </div>
            {/* Time */}
            <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400">
              <Clock size={10} />
              <span>{formatDate(o.createdAt)} at {formatTime(o.createdAt)}</span>
              {o.couponCode && (
                <span className="ml-2 bg-emerald-50 text-emerald-600 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  🏷️ {o.couponCode}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── SECONDARY ACTIONS ────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pb-5">
          <div className="flex gap-2">
            <button
              onClick={() => openEdit(o)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition-all"
            >
              <Edit2 size={13} /> Edit
            </button>
            {canCancel && (
              <button
                onClick={() => doStatus(o.id, 'cancelled', `${o.id} cancelled.`)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold text-xs rounded-xl transition-all"
              >
                <XCircle size={13} /> Cancel
              </button>
            )}
            <button
              onClick={() => doDelete(o.id)}
              className="px-3 py-2.5 bg-white border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-500 rounded-xl transition-all"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── Spec badge ───────────────────────────────────────────────────────────────
  const SpecBadge = ({ label, muted }: { label: string; muted?: boolean }) => (
    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${
      muted ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-white border-slate-200 text-slate-700'
    }`}>
      {label}
    </span>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-3.5rem)] flex overflow-hidden">

      {/* ── LEFT: Order list ────────────────────────────────────────────── */}
      <div className="flex flex-col w-full lg:w-[340px] border-r border-slate-200 bg-white flex-shrink-0">

        {/* Header */}
        <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <h1 className="font-black text-slate-900 text-base">Order Inbox</h1>
            <button onClick={load} className="p-1.5 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-brand-50 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="text"
              placeholder="Name, ID, phone, file…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1.5">
            {TABS.map(t => {
              const count = tabCount(t.key);
              const isNeedsAction = t.key === 'action' && count > 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                    tab === t.key
                      ? isNeedsAction ? 'bg-rose-500 text-white shadow-sm' : 'bg-brand-600 text-white shadow-sm'
                      : isNeedsAction ? 'bg-rose-50 text-rose-600 border border-rose-200 animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {t.key === 'all' ? 'All' : t.label.replace('🔴 ', '')}
                  {count > 0 && (
                    <span className={`text-[9px] font-black px-1.5 rounded-full ${
                      tab === t.key ? 'bg-white/25' : isNeedsAction ? 'bg-rose-100 text-rose-700' : 'bg-slate-300 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <AlertTriangle size={24} className="mb-2 text-slate-300" />
              <p className="text-xs font-semibold">No orders</p>
            </div>
          ) : (
            filtered.map(o => <OrderRow key={o.id} o={o} />)
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <p className="text-[10px] text-slate-400">{filtered.length} orders</p>
          <p className="text-[9px] font-mono text-slate-300 hidden lg:block">P · C · N · Esc</p>
        </div>
      </div>

      {/* ── RIGHT: Detail — desktop always visible ───────────────────────── */}
      <div className="flex-1 min-w-0 hidden lg:flex flex-col overflow-hidden">
        {selected ? (
          <DetailPanel o={selected} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-4">
              <Printer size={28} className="text-slate-300" />
            </div>
            <h3 className="font-bold text-slate-500 text-sm">Select an order</h3>
            <p className="text-slate-400 text-xs mt-1 max-w-[180px] leading-relaxed">
              Click any order on the left to see details and print
            </p>
            <p className="text-[10px] font-mono text-slate-300 mt-4">
              P = print · C = cancel · N = next · Esc = close
            </p>
          </div>
        )}
      </div>

      {/* ── MOBILE: Bottom sheet ─────────────────────────────────────────── */}
      {sheetOpen && selected && (
        <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <DetailPanel o={selected} />
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ───────────────────────────────────────────────────── */}
      {editOpen && selected && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-sm">Edit Print Settings</h3>
                <p className="text-slate-400 text-[10px] mt-0.5">{selected.id}</p>
              </div>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3 text-xs">
              {[
                { label: 'Color Mode', value: eColor, set: setEColor,
                  opts: [{ v: 'bw', l: '⬛ B&W' }, { v: 'color', l: '🎨 Color' }] },
                { label: 'Sides', value: eDuplex, set: setEDuplex,
                  opts: [{ v: 'simplex', l: 'Single-sided' }, { v: 'duplex', l: 'Double-sided' }] },
                { label: 'Paper Size', value: ePaper, set: setEPaper,
                  opts: [{ v: 'A4', l: 'A4' }, { v: 'A3', l: 'A3' }, { v: 'Letter', l: 'Letter' }, { v: 'Legal', l: 'Legal' }] },
              ].map(row => (
                <div key={row.label}>
                  <label className="font-bold text-slate-700 block mb-1">{row.label}</label>
                  <select value={row.value} onChange={e => row.set(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 bg-white outline-none focus:border-brand-400">
                    {row.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Copies</label>
                <input type="number" min={1} max={50} value={eCopies}
                  onChange={e => setECopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-brand-400" />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">🖨️ Printer</label>
                <select value={ePrinter} onChange={e => setEPrinter(e.target.value)}
                  className="w-full border border-brand-200 bg-brand-50/20 rounded-xl p-2.5 font-bold text-slate-800 outline-none focus:border-brand-400">
                  <option value="">Auto</option>
                  {printers.map(p => <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' ★' : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setEditOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={saveEdit}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
