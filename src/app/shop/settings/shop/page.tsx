'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectShopSettings() {
  const router = useRouter();
  useEffect(() => { router.replace('/shop/settings?tab=shop'); }, [router]);
  return <div className="p-6 text-xs text-slate-400">Redirecting to Settings...</div>;
}
