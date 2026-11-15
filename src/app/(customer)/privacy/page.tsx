'use client';
import CustomerHeader from '@/components/CustomerHeader';


import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <CustomerHeader/>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        <div className="card-premium bg-white p-6 space-y-4 text-xs text-slate-600 leading-relaxed">
          <h1 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-2">Privacy Policy</h1>
          <p>At Krishna Students Print Hub, we prioritize your privacy. This policy outlines how we handle data when you use our automated printing portal.</p>
          
          <h3 className="font-bold text-slate-800 uppercase tracking-wide">1. Information We Collect</h3>
          <p>We use your document, name and phone number to manage your print order, payment and collection. When WhatsApp ordering is configured, we send an order acknowledgement through WhatsApp.</p>

          <h3 className="font-bold text-slate-800 uppercase tracking-wide">2. Document Storage & Security</h3>
          <p>Documents are stored privately on the print server or in the configured private object storage and downloaded by the authorized print agent. Temporary agent copies are normally deleted after submission or failure. The shop operator runs retention cleanup for completed orders and unused uploads; active orders and payment disputes are retained. Backups are managed separately. Ask the counter about retention and deletion. Documents are not uploaded to public fallback file hosts.</p>

          <h3 className="font-bold text-slate-800 uppercase tracking-wide">3. Payout & Payment Details</h3>
          <p>All online payments are processed through Razorpay. We do not store credit card credentials, UPI details, or authentication information on our servers.</p>
        </div>
      </main>
    </div>
  );
}

