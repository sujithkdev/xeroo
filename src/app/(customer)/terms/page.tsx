'use client';
import CustomerHeader from '@/components/CustomerHeader';


import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <CustomerHeader/>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <div className="card-premium bg-white p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
          <h1 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-2">Terms of Service</h1>
          <p>By uploading files and making payment, you agree to comply with the terms of service of Krishna Students Print Hub.</p>
          
          <h3 className="font-bold text-slate-800 uppercase tracking-wide">1. Acceptable Use</h3>
          <p>Users must only upload academic records, assignments, projects, or documents for which they have printing privileges. Uploading copyrighted textbooks, illegal materials, or offensive content is strictly prohibited.</p>

          <h3 className="font-bold text-slate-800 uppercase tracking-wide">2. Payments & Pickup</h3>
          <p>Printing starts after payment verification or cash collection and any required counter approval. Submitted jobs require a physical output check. Contact the counter before cancellation or a refund; a document already submitted to Windows may still print.</p>

          <h3 className="font-bold text-slate-800 uppercase tracking-wide">3. Order Expiry</h3>
          <p>Printed documents not picked up from the counter within 7 days of completion may be recycled. No refunds will be provided for uncollected items.</p>
        </div>
      </main>
    </div>
  );
}

