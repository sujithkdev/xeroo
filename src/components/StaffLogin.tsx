'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Printer } from 'lucide-react';
import { useShopName } from './ShopNameContext';

export default function StaffLogin({ admin = false }: { admin?: boolean }) {
  const shop = useShopName();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fields.get('email'), password: fields.get('password') }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Sign-in failed. Please try again.');
      window.location.assign(data.redirect);
    } catch (cause) {
      setError(cause instanceof TypeError ? 'Could not reach the shop. Check your connection and try again.' :
        cause instanceof Error ? cause.message : 'Unable to sign in.');
      setBusy(false);
    }
  }

  const inputStyle = 'w-full rounded-lg border border-[#cbc4d2] bg-white px-4 py-3 text-base focus:outline-2 focus:outline-[#6343b9]';
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f3ed] p-4 text-[#282332] sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#e2dce3] bg-white shadow-xl md:grid-cols-2">
        <aside className="relative isolate flex min-h-32 flex-col justify-between overflow-hidden bg-[#31243d] p-6 text-white md:min-h-[34rem] md:p-10">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center" style={{backgroundImage:"linear-gradient(180deg,rgba(32,20,42,.72),rgba(32,20,42,.28) 40%,rgba(32,20,42,.92)),url('/images/print-studio.png')"}} />
          <div className="flex items-center gap-3 font-semibold"><Printer aria-hidden="true" size={24} /> Xeroo Desk</div>
          <p className="mt-6 break-words font-serif text-3xl leading-tight md:text-5xl">{admin ? 'Platform administration' : shop}</p>
        </aside>
        <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <h1 className="font-serif text-4xl tracking-tight">{admin ? 'Admin sign in' : 'Shop sign in'}</h1>
          <p className="mt-3 text-sm leading-6 text-[#625969]">{admin ? 'Sign in to manage shops and accounts.' : 'Sign in to manage orders and printers.'}</p>
          <form onSubmit={submit} className="mt-8 grid gap-5" aria-busy={busy}>
            <label className="grid gap-2 text-sm font-semibold">Email address
              <input className={inputStyle} type="email" name="email" autoComplete="username" required />
            </label>
            <div>
              <label htmlFor="desk-password" className="mb-2 block text-sm font-semibold">Password</label>
              <div className="relative">
                <input className={inputStyle+' pr-14'} id="desk-password" type={visible ? 'text' : 'password'} name="password" autoComplete="current-password" required />
                <button type="button" className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-lg text-[#625969] focus-visible:outline-2" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <button disabled={busy} className="flex items-center justify-center gap-3 rounded-lg bg-[#6343b9] px-4 py-3 font-semibold text-white hover:bg-[#503398] disabled:opacity-70">
              {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
