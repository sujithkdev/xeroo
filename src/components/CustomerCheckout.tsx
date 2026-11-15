'use client';
import { uploadPrintPdf } from '@/lib/upload-print-pdf';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import CustomerHeader from './CustomerHeader';
import { checkoutAction, payForOrder } from '@/lib/client-checkout';
import {
  Upload, FileText, X, ChevronRight, Clock, CheckCircle2,
  User, Phone, MessageSquare, CreditCard, Loader2, AlertCircle, ArrowLeft,
} from 'lucide-react';

const money = (p: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(p / 100);

/** Live client-side price estimate shown while the user configures settings.
 *  Mirrors the server logic in priceItem / checkout-domain.ts.
 *  Config API sends pricingConfig in RUPEES (e.g. A4_BW=2).
 *  This function works in rupees and returns total in PAISE for money() compatibility. */
function calcPrice(doc: any, pricing: Record<string, number> | null): {
  isDuplex: boolean; sides: number; sheets: number; rateLabel: string;
  printCostRupees: number; finishingRupees: number; copies: number; total: number;
} | null {
  if (!pricing || !doc.pages) return null;
  const baseKey = `${doc.paperSize}_${doc.colorMode === 'color' ? 'Color' : 'BW'}`;
  const sheetKey = `${baseKey}_Sheet`;
  const isDuplex = doc.duplex === 'duplex';

  // Count selected pages (mirrors server selectedPages logic)
  let sides = doc.pages;
  if (doc.pageRange?.trim()) {
    try {
      let count = 0;
      for (const p of doc.pageRange.split(',')) {
        const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p.trim());
        if (!m) return null;
        count += Number(m[2] || m[1]) - Number(m[1]) + 1;
      }
      if (count < 1 || count > doc.pages) return null;
      sides = count;
    } catch { return null; }
  }

  const copies = Math.max(1, Number(doc.copies) || 1);
  const finishingRupees = doc.finishing !== 'none' ? (pricing[doc.finishing] ?? 0) : 0;
  let printCostRupees: number;
  let sheets: number;
  let rateLabel: string;

  if (isDuplex) {
    // Per-sheet rate: use A4_BW_Sheet; fallback to base × 2
    const sheetRate = (pricing[sheetKey] ?? 0) > 0 ? pricing[sheetKey] : (pricing[baseKey] ?? 0) * 2;
    if (!sheetRate) return null;
    sheets = Math.ceil(sides / 2);
    printCostRupees = sheets * sheetRate;
    rateLabel = `${sheets} sheet${sheets !== 1 ? 's' : ''} × ₹${sheetRate.toFixed(2)}/sheet (front+back)`;
  } else {
    const rate = pricing[baseKey];
    if (!rate) return null;
    sheets = sides;
    printCostRupees = sides * rate;
    rateLabel = `${sides} page${sides !== 1 ? 's' : ''} × ₹${rate.toFixed(2)}/page`;
  }

  // Return total in PAISE so money() (which divides by 100) formats correctly
  const total = Math.round((printCostRupees + finishingRupees) * copies * 100);
  return { isDuplex, sides, sheets, rateLabel, printCostRupees, finishingRupees, copies, total };
}

const STEPS = [
  { n: 1, label: 'Upload' },
  { n: 2, label: 'Review & price' },
  { n: 3, label: 'Pickup slot' },
  { n: 4, label: 'Place order' },
];

const OPTION_LABELS: Record<string, Record<string, string>> = {
  colorMode: { bw: 'Black & white', color: 'Colour' },
  duplex: { simplex: 'Single-sided', duplex: 'Double-sided' },
  finishing: { none: 'No finishing', staple: 'Staple', binding: 'Binding', spiral: 'Spiral', lamination: 'Lamination' },
  orientation: { portrait: 'Portrait', landscape: 'Landscape' },
};

export default function CustomerCheckout({ counter = false }: { counter?: boolean }) {
  const router = useRouter();
  const key = counter ? 'counterCheckoutV2' : 'customerCheckoutV2';

  const [config, setConfig] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [requestedAt, setRequestedAt] = useState('');
  const [reservation, setReservation] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [instructions, setInstructions] = useState('');
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lock = useRef(false);

  const timezone = config?.shopSettings?.timezone || 'Asia/Kolkata';
  const rules = config?.printRules || {};

  const fmt = (at: string) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));

  // Restore session
  useEffect(() => {
    fetch('/api/config', { cache: 'no-store' })
      .then(async r => { if (!r.ok) throw Error('Shop settings unavailable. Refresh to retry.'); return r.json(); })
      .then(setConfig)
      .catch(e => setError(e.message));
    try {
      const d = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (d) {
        setDocs(d.docs || []); setQuote(d.quote); setOrder(d.order);
        setStep(d.order ? 3 : 0); setName(d.name || ''); setPhone(d.phone || '');
        setInstructions(d.instructions || ''); setMethod(d.method || 'cash');
      }
    } catch { }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (loaded) sessionStorage.setItem(key, JSON.stringify({ docs, quote, order, name, phone, instructions, method }));
  }, [docs, quote, order, name, phone, instructions, method, key, loaded]);

  async function work(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    await work(async () => {
      const results = await Promise.all(Array.from(files).map(uploadPrintPdf));
      setDocs(old => [...old, ...results]); setQuote(null);
    });
  }

  const edit = (i: number, field: string, value: any) => {
    setDocs(old => old.map((d, j) => j === i ? { ...d, [field]: value } : d));
    setQuote(null); setReservation(null);
  };

  async function getQuote() { await work(async () => { const q = await checkoutAction({ action: 'quote', docs }); setQuote(q); setStep(1); setReservation(null); }); }
  async function getSlots() { await work(async () => { const d = await checkoutAction({ action: 'slots', quoteId: quote.id }); setSlots(d.slots); setRequestedAt(''); setStep(2); }); }
  async function reserve() { await work(async () => { const r = await checkoutAction({ action: 'reserve', quoteId: quote.id, requestedAt }); setReservation(r); setStep(3); }); }
  async function place() {
    await work(async () => {
      const saved = order || await checkoutAction({ action: 'place', quoteId: quote.id, customerName: name, customerPhone: phone, customerInstructions: instructions, paymentMethod: method, source: counter ? 'counter' : 'web' });
      setOrder(saved);
      sessionStorage.setItem(key, JSON.stringify({ docs, quote, order: saved, name, phone, instructions, method }));
      if (saved.paymentMethod === 'online' && !saved.isPaid) await payForOrder(saved, config);
      sessionStorage.removeItem(key);
      router.push(counter ? '/shop/orders/' + saved.id : '/track/' + saved.trackingToken);
    });
  }

  // Drag-and-drop handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length) void upload(files);
  };

  const stepNum = step + 1;
  const canUpload = !busy && !!config;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-main)' }}>
      {!counter && <CustomerHeader />}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <main className="site-width max-w-2xl py-8">

        {/* Step indicator */}
        {!counter && (
          <div className="flex items-center gap-0 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                    ${stepNum > s.n ? 'bg-indigo-600 text-white' : stepNum === s.n ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : 'bg-slate-200 text-slate-400'}`}>
                    {stepNum > s.n ? <CheckCircle2 size={14} /> : s.n}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${stepNum >= s.n ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 mx-2 transition-colors ${stepNum > s.n ? 'bg-indigo-400' : 'bg-slate-200'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div role="alert" className="flex items-start gap-3 p-4 mb-5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ── STEP 0: Upload & configure ── */}
        {!counter && <p className="sm:hidden text-sm font-semibold text-indigo-800 mb-3">Step {stepNum} of {STEPS.length} · {STEPS[step].label}</p>}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h1 className="page-heading">{counter ? 'Walk-in print order' : 'Print your documents'}</h1>
              <p className="text-sm text-slate-500 mt-1">Upload PDFs, set your preferences, and get an instant price.</p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => canUpload && fileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer
                ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'}
                ${!canUpload ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                ref={fileRef}
                type="file" accept="application/pdf,.pdf" multiple
                className="sr-only"
                disabled={!canUpload}
                onChange={e => { void upload(e.target.files); e.target.value = ''; }}
              />
              <div className="flex flex-col items-center gap-3">
                {busy ? (
                  <Loader2 size={32} className="text-indigo-500 animate-spin" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                    <Upload size={24} className="text-indigo-500" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-slate-700">
                    {busy ? 'Uploading…' : dragging ? 'Drop your PDFs here' : 'Drag & drop PDFs here'}
                  </p>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {busy ? 'Please wait' : 'or click to browse — multiple files supported'}
                  </p>
                </div>
                {!config && !busy && <p className="text-xs text-amber-600">Loading shop settings…</p>}
              </div>
            </div>

            {/* Uploaded documents */}
            {docs.map((d, i) => (
              <div key={d.fileUrl + i} className="surface p-5">
                {/* File header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-rose-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 break-all text-sm leading-tight">{d.fileName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{d.pages} pages</p>
                    </div>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => { setDocs(docs.filter((_, j) => j !== i)); setQuote(null); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                    aria-label={`Remove ${d.fileName}`}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Settings grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Page range</label>
                    <input
                      className="input-field text-sm"
                      value={d.pageRange}
                      placeholder="All, or e.g. 1-3,5"
                      onChange={e => edit(i, 'pageRange', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Copies</label>
                    <input
                      type="number" min="1" max={rules.maxCopies || 50}
                      className="input-field text-sm"
                      value={d.copies}
                      onChange={e => edit(i, 'copies', Number(e.target.value))}
                    />
                  </div>
                  {(rules.allowedPaperSizes || ['A4']).length > 1 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Paper size</label>
                      <select className="input-field text-sm" value={d.paperSize} onChange={e => edit(i, 'paperSize', e.target.value)}>
                        {(rules.allowedPaperSizes || ['A4']).map((v: string) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {(rules.allowedColorModes || ['bw']).length > 1 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Colour</label>
                      <select className="input-field text-sm" value={d.colorMode} onChange={e => edit(i, 'colorMode', e.target.value)}>
                        {(rules.allowedColorModes || ['bw']).map((v: string) => <option key={v} value={v}>{OPTION_LABELS.colorMode[v] ?? v}</option>)}
                      </select>
                    </div>
                  )}
                  {rules.allowDuplex && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Sides</label>
                      <select className="input-field text-sm" value={d.duplex} onChange={e => edit(i, 'duplex', e.target.value)}>
                        {['simplex', 'duplex'].map(v => <option key={v} value={v}>{OPTION_LABELS.duplex[v]}</option>)}
                      </select>
                    </div>
                  )}
                  {(rules.allowedFinishing || ['none']).length > 1 && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Finishing</label>
                      <select className="input-field text-sm" value={d.finishing} onChange={e => edit(i, 'finishing', e.target.value)}>
                        {(rules.allowedFinishing || ['none']).map((v: string) => <option key={v} value={v}>{OPTION_LABELS.finishing[v] ?? v}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Live price breakdown */}
                {(() => {
                  const est = calcPrice(d, config?.pricingConfig ?? null);
                  if (!est) return null;
                  return (
                    <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
                      <div className="flex justify-between">
                        <span>{est.rateLabel}</span>
                        <span className="font-medium">₹{est.printCostRupees.toFixed(2)}</span>
                      </div>
                      {est.copies > 1 && (
                        <div className="flex justify-between text-slate-500">
                          <span>× {est.copies} copies</span>
                          <span className="font-medium">₹{(est.printCostRupees * est.copies).toFixed(2)}</span>
                        </div>
                      )}
                      {est.finishingRupees > 0 && (
                        <div className="flex justify-between text-slate-500">
                          <span>Finishing ({d.finishing}) × {est.copies}</span>
                          <span>+₹{(est.finishingRupees * est.copies).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1 mt-1">
                        <span>Estimated total</span>
                        <span>{money(est.total)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}

            {docs.length > 0 && (
              <button
                className="btn-primary w-full flex items-center justify-center gap-2"
                disabled={busy || !config}
                onClick={getQuote}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                {busy ? 'Getting price…' : `Get price for ${docs.length} file${docs.length > 1 ? 's' : ''}`}
                {!busy && <ChevronRight size={16} />}
              </button>
            )}
          </div>
        )}

        {/* ── STEP 1: Review quote ── */}
        {step === 1 && quote && (
          <div className="space-y-4">
            <div>
              <h1 className="page-heading">Review your price</h1>
              <p className="text-sm text-slate-500 mt-1">Quote valid until {fmt(quote.expiresAt)}. Price is fixed once you reserve a slot.</p>
            </div>

            <div className="surface divide-y divide-slate-100">
              {quote.items.map((item: any) => (
                <div key={item.id} className="p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 break-all text-sm">{item.fileName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {item.pages} pages × {item.copies} {item.copies > 1 ? 'copies' : 'copy'}
                      {' · '}{item.paperSize}
                      {' · '}{OPTION_LABELS.colorMode[item.colorMode] ?? item.colorMode}
                      {' · '}{OPTION_LABELS.duplex[item.duplex] ?? item.duplex}
                      {item.finishing !== 'none' && ` · ${OPTION_LABELS.finishing[item.finishing] ?? item.finishing}`}
                    </p>
                  </div>
                  <p className="font-semibold text-slate-800 text-sm shrink-0">{money(item.amountPaise)}</p>
                </div>
              ))}
              <div className="p-4 flex justify-between items-center">
                <span className="font-semibold text-slate-700">Total to pay</span>
                <span className="text-2xl font-bold text-slate-900">{money(quote.amountPaise)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Selected pages determine what's printed. Finishing services are completed by shop staff.
            </p>

            <div className="flex gap-3">
              <button className="btn-secondary flex items-center gap-1.5" onClick={() => setStep(0)}>
                <ArrowLeft size={15} /> Edit files
              </button>
              <button className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={busy} onClick={getSlots}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                {busy ? 'Loading slots…' : 'Choose pickup time'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Pickup slot ── */}
        {step === 2 && (
          <SlotPicker
            slots={slots}
            timezone={timezone}
            selected={requestedAt}
            onSelect={setRequestedAt}
            busy={busy}
            onBack={() => setStep(1)}
            onReserve={reserve}
          />
        )}

        {/* ── STEP 3: Place order ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h1 className="page-heading">{order ? 'Resume your order' : 'Place your order'}</h1>
              <p className="text-sm text-slate-500 mt-1">
                {order ? 'Your order is saved.' : 'Almost there — fill in your details to confirm.'}
              </p>
            </div>

            {/* Order summary card */}
            <div className="surface p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Order total</p>
                  <p className="text-2xl font-bold text-slate-900 mt-0.5">{money(order?.amountPaise || quote?.amountPaise || 0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Requested pickup</p>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">
                    {(order?.requestedPickupAt || reservation?.requestedAt)
                      ? fmt(order?.requestedPickupAt || reservation?.requestedAt)
                      : <span className="text-amber-600">No slot selected</span>}
                  </p>
                </div>
              </div>
            </div>

            {!order && (
              <div className="surface p-5 space-y-4">
                <h2 className="font-semibold text-slate-800">Your details</h2>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <span className="flex items-center gap-1.5"><User size={12} /> Full name</span>
                  </label>
                  <input
                    className="input-field"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={100}
                    autoComplete="name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <span className="flex items-center gap-1.5"><Phone size={12} /> Phone number</span>
                  </label>
                  <input
                    type="tel"
                    className="input-field"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    maxLength={16}
                    autoComplete="tel"
                  />
                  <p className="text-xs text-slate-400 mt-1">For pickup confirmation from the shop.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <span className="flex items-center gap-1.5"><MessageSquare size={12} /> Special instructions <span className="font-normal text-slate-400">(optional)</span></span>
                  </label>
                  <textarea
                    className="input-field resize-none"
                    rows={2}
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    placeholder="Any special requirements for your print job"
                    maxLength={500}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    <span className="flex items-center gap-1.5"><CreditCard size={12} /> Payment method</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {config?.shopSettings?.enableCash !== false && config?.shopSettings?.enableCashPayment !== false && (
                      <button
                        type="button"
                        onClick={() => setMethod('cash')}
                        className={`p-3 rounded-xl border text-sm font-medium text-left transition-all
                          ${method === 'cash' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        <p className="font-semibold">Cash at counter</p>
                        <p className="text-xs mt-0.5 opacity-70">Pay when you collect</p>
                      </button>
                    )}
                    {config?.shopSettings?.upiQr && (
                      <button type="button" aria-pressed={method === 'upi_qr'} onClick={() => setMethod('upi_qr')}
                        className={`p-3 rounded-xl border text-sm text-left ${method === 'upi_qr' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                        <strong>Pay by UPI QR</strong><p>Get the QR after confirming your order.</p>
                      </button>
                    )}
                    {config?.razorpayConfig?.isConfigured && (
                      <button
                        type="button"
                        onClick={() => setMethod('online')}
                        className={`p-3 rounded-xl border text-sm font-medium text-left transition-all
                          ${method === 'online' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                      >
                        <p className="font-semibold">Pay online</p>
                        <p className="text-xs mt-0.5 opacity-70">UPI, card, net banking</p>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={busy || !config || (!order && (!/^\+?\d{7,15}$/.test(phone.replace(/\s/g, '')) || !reservation))}
              onClick={place}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {busy ? 'Placing order…' : (order?.paymentMethod || method) === 'online' ? 'Pay now' : 'Confirm order'}
            </button>

            {!order && (
              <div className="flex gap-3">
                <button className="btn-secondary flex-1 flex items-center justify-center gap-1.5" onClick={() => setStep(2)}>
                  <ArrowLeft size={15} /> Change slot
                </button>
              </div>
            )}

            {order && (
              <Link className="block text-center text-sm text-indigo-600 hover:underline" href={'/track/' + order.trackingToken}>
                Track this order or renew pickup reservation →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


// ─── Calendar Slot Picker ─────────────────────────────────────────────────────

/** Returns a stable "YYYY-MM-DD" string in the shop's timezone. */
function toLocalDateKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

/** Human-readable day label: "Today", "Tomorrow", or "Mon 3 Nov". */
function toDayLabel(dateKey: string, tz: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(Date.now() + 86_400_000)
  );
  if (dateKey === today) return 'Today';
  if (dateKey === tomorrow) return 'Tomorrow';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function SlotPicker({
  slots, timezone, selected, onSelect, busy, onBack, onReserve,
}: {
  slots: string[];
  timezone: string;
  selected: string;
  onSelect: (at: string) => void;
  busy: boolean;
  onBack: () => void;
  onReserve: () => void;
}) {
  // Build day → slots map
  const groups: { key: string; label: string; slots: string[] }[] = [];
  for (const at of slots) {
    const k = toLocalDateKey(at, timezone);
    const g = groups.find(x => x.key === k);
    if (g) g.slots.push(at);
    else groups.push({ key: k, label: toDayLabel(k, timezone), slots: [at] });
  }

  // Selected day — default to the first day that has a slot
  const [activeDay, setActiveDay] = useState<string>(() => {
    if (selected) return toLocalDateKey(selected, timezone);
    return groups[0]?.key ?? '';
  });

  // When parent clears selection, don't reset the day
  const activeGroup = groups.find(g => g.key === activeDay) ?? groups[0];

  const timeFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const earliest = slots[0] ?? null;

  // Month/year header for the calendar strip
  const monthLabel = (() => {
    if (!groups.length) return '';
    const [y, m] = groups[0].key.split('-').map(Number);
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })
      .format(new Date(y, m - 1, 1));
  })();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="page-heading">Choose a pickup time</h1>
        <p className="text-sm text-slate-500 mt-1">
          Times in {timezone.replace('Asia/', '')}. Staff confirm after reviewing your order.
        </p>
      </div>

      {slots.length === 0 ? (
        <div className="surface p-8 text-center">
          <Clock size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No slots available</p>
          <p className="text-sm text-slate-400 mt-1">No capacity in the next 7 days. Contact the shop directly.</p>
        </div>
      ) : (
        <>
          {/* ── Calendar day strip ── */}
          <div className="surface overflow-hidden">
            {/* Month label */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{monthLabel}</p>
              <p className="text-xs text-slate-400">{groups.length} day{groups.length !== 1 ? 's' : ''} available</p>
            </div>

            {/* Day pills — horizontal scroll on mobile */}
            <div className="flex gap-2 p-3 overflow-x-auto scrollbar-none">
              {groups.map(g => {
                const isActive = g.key === activeDay;
                const hasSelected = selected && toLocalDateKey(selected, timezone) === g.key;
                const dayNum = g.key.split('-')[2];
                const weekday = new Intl.DateTimeFormat('en-IN', {
                  timeZone: timezone, weekday: 'short',
                }).format(new Date(Number(g.key.split('-')[0]), Number(g.key.split('-')[1]) - 1, Number(dayNum)));

                return (
                  <button
                    key={g.key}
                    onClick={() => setActiveDay(g.key)}
                    className={`flex flex-col items-center px-4 py-3 rounded-xl border-2 min-w-[64px] transition-all shrink-0
                      ${isActive
                        ? 'border-indigo-500 bg-indigo-600 text-white shadow-md'
                        : hasSelected
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-slate-50'}`}
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${isActive ? 'text-indigo-200' : 'text-slate-400'}`}>
                      {g.label === 'Today' ? 'Today' : g.label === 'Tomorrow' ? 'Tmrw' : weekday}
                    </span>
                    <span className={`text-xl font-bold leading-tight mt-0.5 ${isActive ? 'text-white' : ''}`}>
                      {dayNum}
                    </span>
                    {/* Dot indicator if this day has a selected slot */}
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full ${hasSelected ? 'bg-emerald-400' : isActive ? 'bg-indigo-300' : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Time slots for selected day ── */}
          {activeGroup && (
            <div className="surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">
                  {activeGroup.label} — {activeGroup.slots.length} slot{activeGroup.slots.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="p-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                {activeGroup.slots.map(at => {
                  const isSelected = selected === at;
                  const isFirst = at === earliest;
                  return (
                    <button
                      key={at}
                      onClick={() => onSelect(at)}
                      className={`relative flex flex-col items-center justify-center py-3 rounded-xl border-2 font-medium text-sm transition-all
                        ${isSelected
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-md'
                          : 'border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50'}`}
                    >
                      {isFirst && !isSelected && (
                        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                          Earliest
                        </span>
                      )}
                      <span className="text-sm font-bold">
                        {timeFmt.format(new Date(at))}
                      </span>
                      {isSelected && (
                        <CheckCircle2 size={12} className="mt-1 text-indigo-200" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Selected confirmation bar ── */}
          {selected ? (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
              <span>
                <span className="font-semibold">Selected: </span>
                {toDayLabel(toLocalDateKey(selected, timezone), timezone)}{' '}
                at {timeFmt.format(new Date(selected))}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-500">
              <Clock size={16} className="shrink-0" />
              <span>Tap a time above to select your pickup slot</span>
            </div>
          )}
        </>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-3">
        <button className="btn-secondary flex items-center gap-1.5" onClick={onBack}>
          <ArrowLeft size={15} /> Back
        </button>
        <button
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          disabled={busy || !selected}
          onClick={onReserve}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {busy ? 'Reserving…' : 'Reserve this slot'}
        </button>
      </div>
    </div>
  );
}
