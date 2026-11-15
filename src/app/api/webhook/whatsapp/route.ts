import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { storeDocument } from '@/lib/documents-local';
import { createPrintOrder } from '@/lib/order-service-local';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const config = await db.getWhatsAppConfig();
  if (config.verifyToken && query.get('hub.mode') === 'subscribe' && query.get('hub.verify_token') === config.verifyToken) return new Response(query.get('hub.challenge') || '');
  return new Response('Forbidden', { status: 403 });
}
export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = request.headers.get('x-hub-signature-256') || '';
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return new Response('Signature required', { status: 401 });
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return new Response('Invalid signature', { status: 401 });
  const config = await db.getWhatsAppConfig();
  if (!config.isConfigured || !config.accessToken || !config.phoneNumberId) return new Response('WhatsApp is not configured', { status: 503 });
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
  if (!graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) return new Response('Configure WHATSAPP_GRAPH_VERSION', { status: 503 });
  try {
    const event = JSON.parse(raw);
    for (const entry of event.entry || []) for (const change of entry.changes || []) {
      if (change.value?.metadata?.phone_number_id !== config.phoneNumberId) continue;
      for (const message of change.value.messages || []) {
        if (!message.id || !(await db.claimEvent('wa:' + message.id))) continue;
        try {
          let reply = 'Send a PDF to place a black-and-white A4 print order. Payment is collected at the counter. Use the website for other print options.';
          if (message.type === 'document') {
            if (message.document.mime_type !== 'application/pdf') throw new Error('Only PDF documents are supported.');
            const metaResponse = await fetch(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(message.document.id)}`, { headers: { Authorization: `Bearer ${config.accessToken}` }, signal: AbortSignal.timeout(15000) });
            if (!metaResponse.ok) throw new Error('Could not retrieve WhatsApp document');
            const media = await metaResponse.json();
            const mediaUrl = new URL(media.url);
            if (mediaUrl.protocol !== 'https:' || !/(^|\.)(facebook\.com|fbcdn\.net|fbsbx\.com)$/.test(mediaUrl.hostname)) throw new Error('Unexpected media host');
            const rules = await db.getRules();
            if (Number(media.file_size) > Math.min(rules.maxUploadSizeMB, 50) * 1048576) throw new Error('Document too large');
            const download = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${config.accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
            if (!download.ok) throw new Error('Document download failed');
            const document = await storeDocument(new Uint8Array(await download.arrayBuffer()), message.document.filename || 'whatsapp.pdf', rules.maxUploadSizeMB, rules.maxPages);
            const order = await createPrintOrder({ fileUrl: document.fileUrl, customerName: change.value.contacts?.[0]?.profile?.name || 'WhatsApp customer', customerPhone: message.from, copies: 1, paperSize: 'A4', colorMode: 'bw', duplex: 'simplex', orientation: 'portrait', paymentMethod: 'cash', source: 'whatsapp' });
            reply = `Order ${order.id}\n${order.pages} pages, A4 black & white, one copy.\nTotal: INR ${order.amount.toFixed(2)}. Pay at the counter before printing.\nPickup code: ${order.pickupCode}`;
          }
          const sent = await fetch(`https://graph.facebook.com/${graphVersion}/${config.phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: message.from, type: 'text', text: { body: reply } }), signal: AbortSignal.timeout(15000) });
          if (!sent.ok) throw new Error('WhatsApp reply failed; review the inbox before retrying.');
          await db.finishEvent('wa:' + message.id, 'completed');
        } catch (error) {
          await db.finishEvent('wa:' + message.id, 'needs_review');
          console.error('WhatsApp event requires review:', message.id, error instanceof Error ? error.message : 'Failed');
          // Do not replay ambiguous events and create duplicate print orders.
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 }); }
}

