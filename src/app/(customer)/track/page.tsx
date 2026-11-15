'use client';
import CustomerHeader from '@/components/CustomerHeader';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function TrackingLookup() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { localStorage.removeItem('printOrders'); }, []);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = value.trim().split('/track/').pop()?.split(/[?#]/)[0];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) { setError('Paste the private tracking link provided after checkout. For an older order, contact the shop with your order ID and pickup code.'); return; }
    router.push('/track/' + token);
  }
  return <div className="min-h-screen bg-slate-50"><CustomerHeader /><main className="site-width max-w-lg py-12">
    <h1 className="page-heading">Track your order</h1><p className="text-slate-500 mt-3 mb-6">Use your private tracking link to see payment, printing and collection progress. Keep this link private.</p>
    <form onSubmit={submit} className="surface p-5 space-y-4"><label htmlFor="tracking" className="block text-sm font-medium">Tracking link or token</label><input id="tracking" className="input-field w-full" value={value} onChange={e=>setValue(e.target.value)} required autoComplete="off" /><button className="btn-primary w-full" type="submit">Track order</button>{error && <p role="alert" className="text-sm text-rose-700">{error}</p>}</form>
  </main></div>;
}
