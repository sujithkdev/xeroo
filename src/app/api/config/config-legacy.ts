import {validatePickupRules} from '@/lib/checkout-domain';
/**
 * Legacy single-shop config handler — used when LOCAL_DB_MODE=true.
 * This is the original /api/config implementation, kept intact for local dev.
 */
import { isLocalOperator, isAgent } from '@/lib/access';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const shopSettings = await db.getShopSettings();
    const pricingConfig = await db.getPricing();
    const printRules = await db.getRules();
    const razorpayConfig = await db.getRazorpayConfig();
    const whatsappConfig = await db.getWhatsAppConfig();
    const printers = await db.getPrinters();
    const autoPrintEnabled = await db.getAutoPrintEnabled();
    const lastAgentPing = await db.getLastAgentPing();
    const coupons = await db.getCoupons();
    const agentVersion = await db.kvGet('agentVersion') || 'v1.0.0';
    const agentPcName = await db.kvGet('agentPcName') || 'COUNTER-PC';
    const agentOsVersion = await db.kvGet('agentOsVersion') || 'Windows 10/11';

    const maskedRazorpay = {
      ...razorpayConfig,
      webhookSecret: razorpayConfig.webhookSecret ? '••••••••••••••••' : '',
      keySecret: razorpayConfig.keySecret ? '••••••••••••••••' : '',
    };

    if (!isLocalOperator(request) && !isAgent(request)) {
      return NextResponse.json({
        shopSettings, pricingConfig, printRules,
        razorpayConfig: { keyId: razorpayConfig.keyId, isConfigured: !!razorpayConfig.keyId },
        coupons,
      });
    }

    const response = NextResponse.json({
      shopSettings, pricingConfig, printRules,
      razorpayConfig: maskedRazorpay,
      whatsappConfig: isLocalOperator(request)
        ? {
            ...whatsappConfig,
            accessToken: whatsappConfig.accessToken ? '••••••••••••••••' : '',
            verifyToken: whatsappConfig.verifyToken ? '••••••••••••••••' : '',
          }
        : { isConfigured: !!whatsappConfig.isConfigured },
      printers, capabilities:{refunds:true,whatsapp:true,localMode:true}, printerManagementAvailable:true, autoPrintEnabled, lastAgentPing, coupons,
      agentVersion, agentPcName, agentOsVersion,
    });
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: any = {};
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Malformed JSON payload.' }, { status: 400 }); }

    if (!isLocalOperator(request)) {
      const allowed = ['lastAgentPing', 'agentVersion', 'pcName', 'osVersion', 'printers'];
      if (!isAgent(request) || !body.lastAgentPing || Object.keys(body).some((k) => !allowed.includes(k))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (body.pricingConfig && Object.values(body.pricingConfig).some(
      (v) => typeof v !== 'number' || !Number.isFinite(v as number) || (v as number) <= 0 || (v as number) > 10000
    )) throw new Error('All prices must be positive numbers below 10000.');

    if (body.printRules) {
      validatePickupRules(body.printRules);
      const r = body.printRules;
      for (const key of ['maxUploadSizeMB', 'maxCopies', 'maxPages', 'autoApprovalPageLimit'])
        if (!Number.isSafeInteger(r[key]) || r[key] < 1) throw new Error('Print limits must be positive integers.');
      if (r.maxUploadSizeMB > 50 || r.maxPages > 1000 || r.maxCopies > 500)
        throw new Error('Limits exceed supported maximums.');
      r.allowedFileTypes = ['pdf'];
    }

    if(body.shopSettings?.retentionDays!==undefined&&(!Number.isInteger(body.shopSettings.retentionDays)||body.shopSettings.retentionDays<1||body.shopSettings.retentionDays>3650))return NextResponse.json({error:'Retention must be between 1 and 3650 days.'},{status:400});
    if (body.shopSettings) await db.saveShopSettings({ ...await db.getShopSettings(), ...body.shopSettings });
    if (body.pricingConfig) await db.savePricing({ ...await db.getPricing(), ...body.pricingConfig });
    if (body.printRules) await db.saveRules(body.printRules);
    if (body.razorpayConfig) {
      const current = await db.getRazorpayConfig();
      await db.saveRazorpayConfig({
        ...body.razorpayConfig,
        keySecret: body.razorpayConfig.keySecret === '••••••••••••••••' ? current.keySecret : body.razorpayConfig.keySecret,
        webhookSecret: body.razorpayConfig.webhookSecret === '••••••••••••••••' ? current.webhookSecret : body.razorpayConfig.webhookSecret,
      });
    }
    if (body.whatsappConfig) {
      const current = await db.getWhatsAppConfig();
      for (const key of ['accessToken', 'verifyToken'] as const)
        if (body.whatsappConfig[key] === '••••••••••••••••') body.whatsappConfig[key] = current[key];
      await db.saveWhatsAppConfig(body.whatsappConfig);
    }
    if (body.printers && !body.lastAgentPing) await db.savePrinters(body.printers);
    if (body.autoPrintEnabled !== undefined) await db.saveAutoPrintEnabled(Boolean(body.autoPrintEnabled));
    if (body.coupons) await db.saveCoupons(body.coupons);
    if (body.lastAgentPing) {
      if (!isAgent(request)) return NextResponse.json({ error: 'Unauthorized agent' }, { status: 401 });
      await db.updateAgentPing();
      if (body.agentVersion) await db.kvSet('agentVersion', body.agentVersion);
      if (body.pcName) await db.kvSet('agentPcName', body.pcName);
      if (body.osVersion) await db.kvSet('agentOsVersion', body.osVersion);
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
