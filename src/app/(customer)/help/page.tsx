'use client';
import CustomerHeader from '@/components/CustomerHeader';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, ChevronDown, ChevronUp, MapPin, Phone, Mail, Clock, ExternalLink, Upload, Shield } from 'lucide-react';

const FAQ: { q: string; a: string; tags: string[] }[] = [
  { q: 'What file types can I upload?', a: 'Only PDF files are accepted. Convert Word, PowerPoint or image files to PDF before uploading. The shop validates your PDF when you upload it.', tags: ['file', 'upload', 'pdf'] },
  { q: 'How do I track my order?', a: 'When you place an order you get a private tracking link. Bookmark it. You can also use the "Track order" page and search by your order ID, phone number or pickup code.', tags: ['track', 'order', 'status'] },
  { q: 'What is the difference between requested and confirmed pickup time?', a: 'When you place an order, you request a pickup window. The shop reviews the order and confirms your actual pickup time, which may differ. You\'ll see both on your tracking page.', tags: ['pickup', 'time', 'confirm'] },
  { q: 'How do I pay?', a: 'Online orders can be paid via UPI or card through Razorpay. You can also choose "pay at counter" and pay with cash when you collect. Check what methods the shop currently accepts.', tags: ['pay', 'payment', 'upi', 'cash', 'online'] },
  { q: 'Can I cancel my order?', a: 'You can cancel before the shop starts printing. Contact the shop directly using the phone number on this page or call before your scheduled pickup. Once printing has begun, cancellation is at the shop\'s discretion.', tags: ['cancel', 'refund'] },
  { q: 'How do refunds work?', a: 'For online payments, refunds are processed to your original payment method and typically appear within 5–7 business days. Cash refunds are given at the counter. The shop must approve the refund before it is processed.', tags: ['refund', 'money', 'cancel'] },
  { q: 'My order shows "Sent to printer" — is it ready?', a: '"Sent to printer" means the file has been submitted to the printer queue. It does not mean the document has been physically printed or checked. Wait for the "Ready" status before heading to the shop.', tags: ['printer', 'status', 'ready', 'printing'] },
  { q: 'Can I print double-sided?', a: 'Double-sided printing is available if enabled by the shop. Select "Double-sided" in your print settings. You are charged per printed side — the price per side does not change, but you use fewer physical sheets.', tags: ['duplex', 'double', 'sided', 'printing'] },
  { q: 'How long are my documents stored?', a: 'Documents are stored securely until your order is collected, then deleted within 7 days (or as stated in the shop\'s privacy policy). We do not use your documents for any other purpose.', tags: ['privacy', 'document', 'delete', 'retention', 'store'] },
  { q: 'What if my order is delayed?', a: 'Check the tracking page for the latest status. If you\'re past your pickup window and the order still shows "Preparing", contact the shop directly. The shop can update your pickup time from the order management system.', tags: ['delay', 'late', 'pickup', 'order'] },
  { q: 'Can I place an order after shop hours?', a: 'Yes — you can upload and configure your order at any time. Pickup slots are available during shop hours. Orders placed outside business hours will be processed the next business day.', tags: ['hours', 'closed', 'order', 'time'] },
  { q: 'What happens if my PDF has a password?', a: 'Password-protected or encrypted PDFs cannot be processed. Remove the password using a PDF tool before uploading. The shop will not be able to override this restriction.', tags: ['password', 'encrypted', 'pdf', 'locked'] },
];

export default function HelpPage() {
  const [config, setConfig] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  const shop = config?.shopSettings;
  const rules = config?.printRules;

  const filtered = query.trim()
    ? FAQ.filter((f) => {
        const q = query.toLowerCase();
        return f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q) || f.tags.some((t) => t.includes(q));
      })
    : FAQ;

  const toggleFaq = (i: number) => {
    setOpen((prev) => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <CustomerHeader />
      <main className="site-width py-10 max-w-2xl">
        <div className="eyebrow">SUPPORT</div>
        <h1 className="page-heading">Help &amp; information</h1>

        {/* Shop info */}
        {shop && (
          <div className="surface p-5 mb-8 grid sm:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Location</p>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex gap-2"><MapPin size={14} className="shrink-0 mt-0.5 text-slate-400" />{shop.address}</div>
                <div className="flex gap-2"><Clock size={14} className="shrink-0 mt-0.5 text-slate-400" />{shop.workingHoursText || `${rules?.workingHoursStart} – ${rules?.workingHoursEnd}`}</div>
              </div>
              {shop.googleMapsUrl && (
                <a href={shop.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-600 font-medium hover:underline">
                  Get directions <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Contact</p>
              <div className="space-y-2 text-sm text-slate-600">
                {shop.phone && (
                  <div className="flex gap-2"><Phone size={14} className="shrink-0 mt-0.5 text-slate-400" />
                    <a href={`tel:${shop.phone}`} className="hover:text-indigo-600">{shop.phone}</a>
                  </div>
                )}
                {shop.email && (
                  <div className="flex gap-2"><Mail size={14} className="shrink-0 mt-0.5 text-slate-400" />
                    <a href={`mailto:${shop.email}`} className="hover:text-indigo-600">{shop.email}</a>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-3">Response during business hours only.</p>
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {[
            { href: '/upload', icon: Upload, label: 'Start a print order' },
            { href: '/track', icon: Search, label: 'Track your order' },
            { href: '/pricing', icon: null, label: 'View all prices' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="surface p-4 text-sm font-medium text-slate-700 hover:border-indigo-300 transition-colors">
              {label} →
            </Link>
          ))}
        </div>

        {/* Collection instructions */}
        <div className="surface p-5 mb-6">
          <h2 className="font-semibold mb-3">Collecting your order</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
            <li>Wait for the <strong>"Ready"</strong> status on your tracking page before visiting.</li>
            <li>Show your <strong>pickup code</strong> (displayed when ready) at the counter.</li>
            <li>Check the printed output before leaving — report any issues immediately.</li>
            <li>If paying at counter, have the exact amount or UPI QR ready.</li>
          </ol>
        </div>

        {/* Supported formats */}
        <div className="surface p-5 mb-8">
          <h2 className="font-semibold mb-3">Supported files &amp; limits</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Accepted formats', value: 'PDF only' },
              { label: 'Max file size', value: `${rules?.maxUploadSizeMB ?? 50} MB per file` },
              { label: 'Max pages', value: `${rules?.maxPages ?? 500} pages per file` },
              { label: 'Max copies', value: `${rules?.maxCopies ?? 50} copies` },
              { label: 'Documents per order', value: `Up to ${rules?.maxDocumentsPerOrder ?? 10}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-700">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-slate-400">
            <Shield size={12} className="shrink-0 mt-0.5" />
            <span>
              Documents are stored only for the duration of your order and deleted within {shop?.retentionDays ?? 7} days of collection.
              We do not read or share your documents.
            </span>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-6">
          <h2 className="font-semibold text-lg mb-4">Frequently asked questions</h2>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              className="input-field !pl-9"
              placeholder="Search questions…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search FAQ"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No results for "{query}". Try different words or contact the shop.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((faq, i) => (
                <div key={i} className="surface overflow-hidden">
                  <button
                    className="w-full flex justify-between items-start gap-4 px-5 py-4 text-left"
                    onClick={() => toggleFaq(i)}
                    aria-expanded={open.has(i)}
                  >
                    <span className="font-medium text-sm text-slate-800">{faq.q}</span>
                    {open.has(i) ? <ChevronUp size={16} className="shrink-0 text-slate-400 mt-0.5" /> : <ChevronDown size={16} className="shrink-0 text-slate-400 mt-0.5" />}
                  </button>
                  {open.has(i) && (
                    <div className="px-5 pb-4 text-sm text-slate-600 leading-6 border-t pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Legal links */}
        <div className="flex gap-4 text-sm text-slate-400">
          <Link href={shop?.privacyPolicyUrl || '/privacy'} className="hover:text-indigo-600">Privacy policy</Link>
          <Link href={shop?.termsUrl || '/terms'} className="hover:text-indigo-600">Terms of service</Link>
        </div>
      </main>
    </div>
  );
}
