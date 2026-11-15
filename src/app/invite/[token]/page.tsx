'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff member',
};

export default function Invitation() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/invitations?token=' + encodeURIComponent(token), {
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setInvite(d);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password }),
        referrerPolicy: 'no-referrer',
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setPassword('');
      setResult(d);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not accept invitation');
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = invite ? (ROLE_LABELS[invite.role] ?? invite.role) : '';
  const isOwner = invite?.role === 'owner';

  return (
    <main className="min-h-screen bg-slate-50 flex items-start justify-center pt-16 px-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="page-heading text-center">Staff invitation</h1>

        {error && (
          <div role="alert" className="flex items-start gap-2 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {done ? (
          <div className="surface p-6 space-y-4 text-center">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
            <div>
              <p className="font-semibold text-slate-800">You've joined {invite?.name}!</p>
              <p className="text-sm text-slate-500 mt-1">
                Your role is <span className="font-medium">{ROLE_LABELS[result?.role ?? invite?.role] ?? roleLabel}</span>.
                Sign in to access the shop dashboard.
              </p>
            </div>
            <a className="btn-primary w-full block text-center" href="/shop/login">
              Sign in to the shop
            </a>
          </div>
        ) : invite ? (
          <form onSubmit={accept} className="surface p-6 space-y-5">
            {/* Invitation summary */}
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
              <p className="font-semibold text-indigo-800">{invite.name}</p>
              <p className="text-indigo-600 mt-0.5">{invite.email} · {roleLabel}</p>
              <p className="text-xs text-indigo-400 mt-1">
                Expires {new Date(invite.expires_at).toLocaleString('en-IN')}
              </p>
            </div>

            {/* New user: collect name */}
            {isOwner && (
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Your name</span>
                <input
                  required
                  className="input-field w-full mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Full name"
                />
              </label>
            )}

            {!isOwner && (
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  Your name <span className="text-slate-400 font-normal">(new accounts only)</span>
                </span>
                <input
                  className="input-field w-full mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Only required if you don't have an account yet"
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                {isOwner
                  ? 'New account password, or your existing account password'
                  : 'Your account password (existing account) or a new password'}
              </span>
              <input
                required
                minLength={8}
                type="password"
                className="input-field w-full mt-1"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
              />
            </label>

            <p className="text-xs text-slate-400">
              Already have an account? Enter your existing password — your credentials won't change.
            </p>

            <button disabled={busy} className="btn-primary w-full">
              {busy
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Joining…</span>
                : 'Accept invitation & join shop'}
            </button>
          </form>
        ) : !error ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : null}
      </div>
    </main>
  );
}
