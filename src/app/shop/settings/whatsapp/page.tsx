'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectWhatsAppSettings() {
  const router = useRouter();
  useEffect(() => { router.replace('/shop/settings?tab=whatsapp'); }, [router]);
  return <div className="p-6 text-xs text-slate-400">Redirecting to Settings...</div>;
}
