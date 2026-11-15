'use client';
import CustomerHeader from '@/components/CustomerHeader';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Upload, ChevronRight, Info, Calculator, AlertTriangle } from 'lucide-react';

function calcEstimate(pricing: any, pages: number, copies: number, colorMode: string, paperSize: string, duplex: string): number {
  if (!pricing || pages === 0) return 0;
  const key = `${paperSize}_${colorMode.toUpperCase()}`;
  const rate = pricing[key] ?? pricing.A4_BW ?? 2;
  const sides = duplex === 'duplex' ? Math.ceil(pages / 2) : pages;
  return Math.round(rate * sides * copies * 100) / 100;
}

export default function PricingPage() {
  const [config, setConfig] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);
  // Estimator state
  const [pages, setPages] = useState(10);
  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState('bw');
  const [paperSize, setPaperSize] = useState('A4');
  const [duplex, setDuplex] = useState('simplex');

  useEffect(() => {
    fetch('/api/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setLoadError(true));
  }, []);

  const pricing = config?.pricingConfig;
  const rules = config?.printRules;
  const estimate = pricing ? calcEstimate(pricing, pages, copies, colorMode, paperSize, duplex) : null;

  const PAPER_LABELS: Record<string, string> = {
    A4: 'A4 (210 × 297 mm)', A3: 'A3 (297 × 420 mm)',
    Letter: 'Letter (215.9 × 279.4 mm)', Legal: 'Legal (215.9 × 355.6 mm)',
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <CustomerHeader />
      <main className="site-width py-10 max-w-2xl">
        <div className="eyebrow">PRINTING WITH {config?.shopSettings?.name?.toUpperCase() ?? 'YOUR SHOP'}</div>
        <h1 className="page-heading">Prices &amp; services</h1>
        <p className="text-sm text-slate-500 mt-2 mb-8">
          All prices are per printed side (one face of one sheet). Double-sided printing uses fewer sheets but the same number of sides.
        </p>

        {loadError && (
          <div role="alert" className="mb-6 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            <AlertTriangle size={14} /> Could not load live pricing. Shown rates may be outdated.
          </div>
        )}

        {/* B&W */}
        <section className="surface mb-4 overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-slate-50">
            <h2 className="font-semibold">Black &amp; White printing</h2>
            <p className="text-xs text-slate-400 mt-0.5">Rate per printed side</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b">
              <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Paper size</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500">Per side</th>
              <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500">10 sides</th>
            </tr></thead>
            <tbody>
              {[
                { key: 'A4_BW', size: 'A4' }, { key: 'A3_BW', size: 'A3' },
                { key: 'Letter_BW', size: 'Letter' }, { key: 'Legal_BW', size: 'Legal' },
              ].filter(({ key }) => pricing?.[key] != null || !pricing).map(({ key, size }) => {
                const rate = pricing?.[key] ?? { A4_BW: 2, A3_BW: 5, Letter_BW: 2.5, Legal_BW: 3 }[key];
                return (
                  <tr key={key} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3">{PAPER_LABELS[size] ?? size}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800">₹{rate?.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right text-slate-500">₹{(rate * 10)?.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Colour */}
        {rules?.allowedColorModes?.includes('color') !== false && (
          <section className="surface mb-4 overflow-hidden">
            <div className="px-5 py-3.5 border-b bg-slate-50">
              <h2 className="font-semibold">Colour printing</h2>
              <p className="text-xs text-slate-400 mt-0.5">Rate per printed side · full colour output</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500">Paper size</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500">Per side</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-slate-500">10 sides</th>
              </tr></thead>
              <tbody>
                {[{ key: 'A4_Color', size: 'A4' }, { key: 'A3_Color', size: 'A3' }].map(({ key, size }) => {
                  const rate = pricing?.[key] ?? { A4_Color: 10, A3_Color: 20 }[key];
                  return (
                    <tr key={key} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-5 py-3">{PAPER_LABELS[size]}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">₹{rate?.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-slate-500">₹{(rate * 10)?.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* Duplex note */}
        <section className="surface mb-4 p-5">
          <h2 className="font-semibold mb-3">Single-sided vs Double-sided</h2>
          <div className="space-y-2 text-sm text-slate-600">
            <p><strong>Single-sided (simplex):</strong> each page uses one side of one sheet. 10 pages = 10 sides = 10 sheets.</p>
            <p><strong>Double-sided (duplex):</strong> pairs of pages share a sheet, but you still pay per printed side. 10 pages = 10 sides = 5 sheets. The per-side rate does not change — you save on paper, not on the price per side.</p>
            {!rules?.allowDuplex && (
              <p className="text-amber-700 flex items-center gap-2"><AlertTriangle size={13} /> Double-sided printing is not currently available at this shop.</p>
            )}
          </div>
        </section>

        {/* Finishing */}
        <section className="surface mb-4 overflow-hidden">
          <div className="px-5 py-3.5 border-b bg-slate-50">
            <h2 className="font-semibold">Finishing services</h2>
            <p className="text-xs text-slate-400 mt-0.5">Per document / per set</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {[
                { name: 'Staple', note: 'Up to 30 sheets', price: '₹5' },
                { name: 'Spiral binding', note: 'Up to 300 pages', price: '₹40' },
                { name: 'Thermal binding', note: 'Book-style cover', price: '₹30' },
                { name: 'Lamination (A4)', note: 'Per sheet', price: '₹20' },
              ].map(({ name, note, price }) => (
                <tr key={name} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium">{name}</td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{note}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-800">{price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Price estimator */}
        <section className="surface mb-8 overflow-hidden border-indigo-100">
          <div className="px-5 py-3.5 border-b bg-indigo-50">
            <h2 className="font-semibold text-indigo-800 flex items-center gap-2"><Calculator size={16} /> Price estimator</h2>
            <p className="text-xs text-indigo-600 mt-0.5">Estimate only — final price requires document validation at checkout.</p>
          </div>
          <div className="p-5 grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Number of pages</label>
              <input type="number" min={1} className="input-field" value={pages} onChange={(e) => setPages(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Copies</label>
              <input type="number" min={1} className="input-field" value={copies} onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Colour mode</label>
              <select className="input-field" value={colorMode} onChange={(e) => setColorMode(e.target.value)}>
                <option value="bw">Black & White</option>
                <option value="color">Colour</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Paper size</label>
              <select className="input-field" value={paperSize} onChange={(e) => setPaperSize(e.target.value)}>
                {['A4', 'A3', 'Letter', 'Legal'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Sides</label>
              <select className="input-field" value={duplex} onChange={(e) => setDuplex(e.target.value)}>
                <option value="simplex">Single-sided</option>
                {rules?.allowDuplex !== false && <option value="duplex">Double-sided</option>}
              </select>
            </div>
            <div className="flex items-end">
              {estimate !== null ? (
                <div>
                  <p className="text-xs text-slate-400">Estimated total</p>
                  <p className="text-2xl font-bold text-indigo-700">₹{estimate.toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Add pages and select options above</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-5 pb-5 text-xs text-slate-400">
            <Info size={12} className="shrink-0 mt-0.5" />
            This estimate does not include finishing, discounts or minimum charges. Actual price is calculated from your validated document at checkout.
          </div>
        </section>

        {/* CTA */}
        <div className="flex flex-wrap gap-3">
          <Link href="/upload" className="btn-primary">
            <Upload size={16} /> Upload documents
          </Link>
          <Link href="/help" className="btn-secondary">
            Questions? <ChevronRight size={15} />
          </Link>
        </div>
      </main>
    </div>
  );
}
