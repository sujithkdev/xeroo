import {recordPrinterInventory,printerHeartbeat,savePrinterCapabilities} from '@/lib/desktop-printers';
import {encryptPaymentSecret} from '@/lib/payment-context';
import {validatePickupRules} from '@/lib/checkout-domain';
/**
 * /api/config — backward-compatible shop config endpoint.
 * In LOCAL_DB_MODE: delegates to legacy single-shop logic.
 * In multi-shop mode: reads shop context from x-shop-id header (set by middleware).
 */
import { NextResponse } from 'next/server';
import { isLocalOperator, isAgent, isLocalMode, verifyAgentToken } from '@/lib/access';
import { getSessionWithShop } from '@/lib/auth/sessions';
import { requireOwner, AuthError } from '@/lib/auth/permissions';
import {
  getShopById, getShopSettings, getCurrentPrices,
  getPrintRules, getPaymentConfig, getCoupons, getPrinters,
  upsertAgentHeartbeat,
} from '@/lib/db/shops';
import { db as legacyDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // ── LOCAL_DB_MODE: use original implementation ──────────────────────────
    if (isLocalMode()) {
      const { GET: legacyGet } = await import('./config-legacy');
      return legacyGet(request);
    }

    const shopId = request.headers.get('x-shop-id');

    // Public shop info (customer-facing)
    if (!shopId) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const [shop, settings, prices, rules, payConfig, coupons] = await Promise.all([
      getShopById(shopId),
      getShopSettings(shopId),
      getCurrentPrices(shopId),
      getPrintRules(shopId),
      getPaymentConfig(shopId),
      getCoupons(shopId),
    ]);

    if (!shop) return NextResponse.json({ error: 'Shop not found' }, { status: 404 });

    // What the public / customer-facing UI gets
    const publicResponse = {
      shopSettings: {
        name: shop.name,
        upiQr: shop.subdomain === 'krishna',
        address: shop.address,
        phone: shop.phone,
        email: shop.email,
        timezone: shop.timezone,
        tagline: settings?.tagline,
        gstNumber: settings?.gst_number,
        logoUrl: settings?.logo_url,
        googleMapsUrl: settings?.google_maps_url,
        workingHoursText: settings?.working_hours_text,
        enableCash: settings?.enable_cash ?? true,
        enableCashPayment: settings?.enable_cash ?? true,
        enableOnline: settings?.enable_online ?? false,
        enableOnlinePayment: settings?.enable_online ?? false,
        retentionDays: settings?.retention_days ?? 7,
        acceptingOrders: settings?.accepting_orders ?? true,
        orderingPausedReason: settings?.ordering_paused_reason,
        privacyPolicyUrl: settings?.privacy_policy_url,
        termsUrl: settings?.terms_url,
      },
      pricingConfig: pricesToLegacy(prices),
      printRules: { ...rulesToLegacy(rules), acceptingOrders: settings?.accepting_orders ?? false, orderingPausedReason: settings?.ordering_paused_reason },
      razorpayConfig: {
        keyId: payConfig?.razorpay_key_id ?? '',
        isConfigured: payConfig?.is_configured ?? false,
        testMode: payConfig?.razorpay_test_mode ?? true,
      },
      coupons: coupons.map((c) => ({
        code: c.code,
        discountPercent: c.discount_percent ?? 0,
        isActive: c.is_active,
      })),
    };

    // Staff / agent — add internal-only fields
    const agent = await verifyAgentToken(request);
    const session = agent ? null : await getSessionWithShop(request);
    if (agent && agent.shopId !== shopId) return NextResponse.json({error:'Agent/shop mismatch'},{status:403});
    const isStaff = agent?.shopId === shopId ||
      (session?.shopId === shopId) || session?.isPlatformAdmin;

    if (!isStaff) {
      return NextResponse.json(publicResponse, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const heartbeat=await printerHeartbeat(shopId);
    const online=!!heartbeat?.last_seen_at&&Date.now()-new Date(heartbeat.last_seen_at).getTime()<30000;
    const printers = (await getPrinters(shopId)).map(p=>({...p,status:online&&heartbeat?.detected_printers.some(d=>d.Name===p.name&&!d.WorkOffline)?'idle':'offline',supportsColor:p.supports_color,supportsA3:p.supports_a3,supportsDuplex:p.supports_duplex,isDefaultBW:p.is_default_bw,isDefaultColor:p.is_default_color}));

    return NextResponse.json({
      ...publicResponse,
      printers, capabilities:{refunds:false,whatsapp:false,localMode:false}, plan:shop.plan, printerManagementAvailable:true,
      autoPrintEnabled: settings?.auto_print_enabled ?? true,
      lastAgentPing: heartbeat?.last_seen_at || null,
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (e: any) {
    return NextResponse.json({ error: e instanceof AuthError ? e.message : 'Configuration unavailable.' }, { status: e instanceof AuthError ? e.status : 503 });
  }
}

export async function POST(request: Request) {
  try {
    if (isLocalMode()) {
      const { POST: legacyPost } = await import('./config-legacy');
      return legacyPost(request);
    }

    const shopId = request.headers.get('x-shop-id');
    if (!shopId) return NextResponse.json({ error: 'Shop not found' }, { status: 404 });

    // Agent heartbeat
    const agent = await verifyAgentToken(request);
    if (agent) {
      if (agent.shopId !== shopId) {
        return NextResponse.json({ error: 'Agent/shop mismatch' }, { status: 403 });
      }
      const body = await request.json();
      if(body.printers!==undefined)await recordPrinterInventory(shopId,agent.agentId,body.printers);
      await upsertAgentHeartbeat(agent.agentId, {
        agent_version: body.agentVersion,
        pc_name: body.pcName,
        os_version: body.osVersion,
      });
      return NextResponse.json({ success: true });
    }

    // Staff config update
    const session = await getSessionWithShop(request);
    requireOwner(session);
    const body = await request.json();
    if (Object.keys(body).some(k => !['printers','shopSettings','pricingConfig','printRules','autoPrintEnabled','acceptingOrders','razorpayConfig'].includes(k))) return NextResponse.json({error:'Unsupported settings update.'},{status:400});

    if(body.printers!==undefined)await savePrinterCapabilities(shopId,body.printers);
    const { upsertShopSettings, upsertPrintRules, setPrices, upsertPaymentConfig } = await import('@/lib/db/shops');

    if(body.razorpayConfig){
      const r=body.razorpayConfig,previous=await getPaymentConfig(shopId);
      const secret=(value:any,existing:string|null|undefined)=>typeof value==='string'&&value.length&&!value.includes('•')?encryptPaymentSecret(value):existing;
      const keyId=String(r.keyId??previous?.razorpay_key_id??'').trim();
      const keySecret=secret(r.keySecret,previous?.razorpay_key_secret_enc);
      const webhookSecret=secret(r.webhookSecret,previous?.razorpay_webhook_secret_enc);
      await upsertPaymentConfig(shopId,{razorpay_key_id:keyId,razorpay_key_secret_enc:keySecret||undefined,razorpay_webhook_secret_enc:webhookSecret||undefined,razorpay_test_mode:keyId.startsWith('rzp_test_'),is_configured:!!(keyId&&keySecret&&webhookSecret)});
    }
    if (body.shopSettings?.retentionDays !== undefined && (!Number.isSafeInteger(body.shopSettings.retentionDays) || body.shopSettings.retentionDays < 1 || body.shopSettings.retentionDays > 3650)) return NextResponse.json({error:'Retention must be between 1 and 3650 days.'},{status:400});
    if (body.shopSettings) {
      const profile:Record<string,string>={};
      for(const key of ['name','address','phone','email','timezone'])if(body.shopSettings[key]!==undefined){
        if(typeof body.shopSettings[key]!=='string'||body.shopSettings[key].length>500)throw Error('Invalid shop profile.');
        profile[key]=body.shopSettings[key].trim();
      }
      if(profile.name!==undefined&&!profile.name)throw Error('Shop name is required.');
      if(profile.timezone!==undefined)new Intl.DateTimeFormat('en',{timeZone:profile.timezone}).format();
      const cols=Object.keys(profile);
      if(cols.length){const {query}=await import('@/lib/db/client');await query(`UPDATE shops SET ${cols.map((key,i)=>key+'=$'+(i+2)).join(',')},updated_at=now() WHERE id=$1`,[shopId,...cols.map(key=>profile[key])]);}
      await upsertShopSettings(shopId, settingsFromLegacy(body.shopSettings));
    }
    if (body.pricingConfig) {
      const priceMap: Record<string, number> = {};
      for (const [k, v] of Object.entries(body.pricingConfig)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 10000) return NextResponse.json({error:'Invalid price.'},{status:400});
        priceMap[k] = Math.round(v * 100);
      }
      await setPrices(shopId, priceMap);
    }
    if (body.printRules) {
      const currentRules = await getPrintRules(shopId);
      validatePickupRules({...rulesToLegacy(currentRules), ...body.printRules});
      await upsertPrintRules(shopId, rulesFromLegacy(body.printRules));
      if(body.printRules.acceptingOrders!==undefined){if(typeof body.printRules.acceptingOrders!=='boolean')throw Error('Invalid ordering status.');await upsertShopSettings(shopId,{accepting_orders:body.printRules.acceptingOrders});}
    }
    if (body.autoPrintEnabled !== undefined) {
      await upsertShopSettings(shopId, { auto_print_enabled: Boolean(body.autoPrintEnabled) });
    }
    if (body.acceptingOrders !== undefined) {
      await upsertShopSettings(shopId, { accepting_orders: Boolean(body.acceptingOrders) });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof AuthError ? e.message : 'Configuration unavailable.' }, { status: e instanceof AuthError ? e.status : 503 });
  }
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

function pricesToLegacy(prices: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(prices)) {
    out[k] = v / 100; // paise → rupees for legacy UI
  }
  return out;
}

function rulesToLegacy(r: any) {
  if (!r) return {};
  return {
    maxUploadSizeMB: r.max_upload_size_mb,
    maxCopies: r.max_copies,
    maxPages: r.max_pages,
    maxDocumentsPerOrder: r.max_docs_per_order,
    autoApprovalPageLimit: r.auto_approval_limit,
    allowDuplex: r.allow_duplex,
    allowedPaperSizes: r.allowed_paper_sizes,
    allowedColorModes: r.allowed_color_modes,
    allowedFinishing: r.allowed_finishing,
    slotDurationMinutes: r.slot_duration_minutes,
    slotCapacity: r.slot_capacity,
    slotPageCapacity: r.slot_page_capacity,
    minPrepMinutes: r.min_prep_minutes,
    workingHoursStart: r.working_hours_start,
    workingHoursEnd: r.working_hours_end,
    printMode: r.print_mode,
  };
}

function settingsFromLegacy(s: any) {
  return {
    tagline: s.tagline,
    gst_number: s.gstNumber,
    logo_url: s.logoUrl,
    google_maps_url: s.googleMapsUrl,
    working_hours_text: s.workingHoursText,
    enable_cash: s.enableCashPayment ?? s.enableCash,
    enable_online: s.enableOnlinePayment ?? s.enableOnline,
    retention_days: s.retentionDays,
    accepting_orders: s.acceptingOrders,
    ordering_paused_reason: s.orderingPausedReason,
    privacy_policy_url: s.privacyPolicyUrl,
    terms_url: s.termsUrl,
  };
}

function rulesFromLegacy(r: any) {
  return {
    max_upload_size_mb: r.maxUploadSizeMB,
    max_copies: r.maxCopies,
    max_pages: r.maxPages,
    max_docs_per_order: r.maxDocumentsPerOrder,
    allowed_finishing: r.allowedFinishing,
    slot_duration_minutes: r.slotDurationMinutes,
    slot_capacity: r.slotCapacity,
    slot_page_capacity: r.slotPageCapacity,
    min_prep_minutes: r.minPrepMinutes,
    working_hours_start: r.workingHoursStart,
    working_hours_end: r.workingHoursEnd,
    auto_approval_limit: r.autoApprovalPageLimit,
    allow_duplex: r.allowDuplex,
    allowed_paper_sizes: r.allowedPaperSizes,
    allowed_color_modes: r.allowedColorModes,
    print_mode: r.printMode,
  };
}
