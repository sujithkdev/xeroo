'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectRazorpaySettings() {
  const router = useRouter();
  useEffect(() => { router.replace('/shop/settings?tab=razorpay'); }, [router]);
  return <div className="p-6 text-xs text-slate-400">Redirecting to Settings...</div>;
}
