'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectAccountSettings() {
  const router = useRouter();
  useEffect(() => { router.replace('/shop/settings?tab=account'); }, [router]);
  return <div className="p-6 text-xs text-slate-400">Redirecting to Settings...</div>;
}
