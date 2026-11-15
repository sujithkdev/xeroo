import {db} from './db';
import {withTransaction} from './db/client';
import {getShopSettings,getPrintRules,getCurrentPrices,getShopById,getPaymentConfig} from './db/shops';
import {Quote} from './checkout-domain';
export type CheckoutState={quotes:Quote[];orders:any[];launch:any};
export function fromStoredOrder(row:any):any {
 return {...(row.checkout_payload||{}),id:row.id,trackingToken:row.tracking_token,pickupCode:row.pickup_code,customerName:row.customer_name,customerPhone:row.customer_phone,customerInstructions:row.customer_instructions,staffNotes:row.staff_notes,amount:row.amount_paise/100,amountPaise:row.amount_paise,status:row.order_status,isPaid:row.payment_status==='paid',paymentStatus:row.payment_status,paymentMethod:row.payment_method,source:row.source,razorpayOrderId:row.razorpay_order_id,paymentId:row.payment_id,refundState:row.refund_state,claimToken:row.claim_token,claimedBy:row.claimed_by_agent_id,assignedPrinterId:row.assigned_printer_id,requestedPickupAt:row.requested_pickup_at?.toISOString(),confirmedPickupAt:row.confirmed_pickup_at?.toISOString(),createdAt:row.created_at?.toISOString(),updatedAt:row.updated_at?.toISOString()};
}
export async function checkoutTransaction<T>(shopId:string|null,fn:(state:CheckoutState)=>Promise<T>):Promise<T>{
 if(!shopId)return db.checkoutTransaction(fn);
 return withTransaction(async client=>{
  // All reservations and operational order changes serialize on the same shop row.
  const lock=await client.query('SELECT id FROM shops WHERE id=$1 FOR UPDATE',[shopId]);if(!lock.rowCount)throw Error('Shop not found.');
  await client.query('INSERT INTO checkout_state(shop_id) VALUES($1) ON CONFLICT DO NOTHING',[shopId]);
  const stored=(await client.query('SELECT quotes,launch FROM checkout_state WHERE shop_id=$1',[shopId])).rows[0];const quotes=stored.quotes;const launch=stored.launch;
  const rows=(await client.query('SELECT * FROM orders WHERE shop_id=$1 FOR UPDATE',[shopId])).rows;
  const orders=rows.map(fromStoredOrder);const before=new Map(orders.map(o=>[o.id,JSON.stringify(o)]));
  const result=await fn({quotes,orders,launch});
  await client.query('UPDATE checkout_state SET quotes=$2,launch=$3 WHERE shop_id=$1',[shopId,JSON.stringify(quotes),JSON.stringify(launch)]);
  for(const o of orders){
   if(before.get(o.id)===JSON.stringify(o))continue;
   if(!before.has(o.id))await client.query(`INSERT INTO orders(id,shop_id,tracking_token,pickup_code,customer_name,customer_phone,source,payment_method,amount_paise,checkout_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[o.id,shopId,o.trackingToken,o.pickupCode,o.customerName,o.customerPhone,o.source,o.paymentMethod,Math.round(o.amount*100),JSON.stringify(o)]);
   if(!before.has(o.id))for(const [index,item] of (o.documents||[]).entries()){
    const documentId=/^\/api\/file\/([0-9a-f-]{36})$/.exec(item.fileUrl)?.[1];
    if(!documentId)throw Error('Invalid print artifact.');
    await client.query('INSERT INTO order_items(order_id,shop_id,document_id,file_name,pages,page_range,copies,color_mode,paper_size,duplex,finishing,item_paise,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[o.id,shopId,documentId,item.fileName,item.pages,item.pageRange||null,item.copies,item.colorMode,item.paperSize,item.duplex,item.finishing,item.itemAmountPaise,index]);
    await client.query(`UPDATE documents SET order_id=$1,expires_at=GREATEST(COALESCE(expires_at,now()),now() + COALESCE((SELECT retention_days FROM shop_settings WHERE shop_id=$3),7) * interval '1 day') WHERE id=$2 AND shop_id=$3 AND deleted_at IS NULL`,[o.id,documentId,shopId]);
   }
   await client.query(`UPDATE orders SET order_status=$3,payment_status=$4,collection_status=$5,requested_pickup_at=$6,confirmed_pickup_at=$7,razorpay_order_id=$8,payment_id=$9,claim_token=$10,claimed_by_agent_id=$11,staff_notes=$12,customer_instructions=$13,checkout_payload=$14,assigned_printer_id=$15,updated_at=now() WHERE id=$1 AND shop_id=$2`,[o.id,shopId,o.status,o.isPaid?'paid':'unpaid',o.collectionStatus||'pending',o.requestedPickupAt||null,o.confirmedPickupAt||null,o.razorpayOrderId||null,o.paymentId||null,o.claimToken||null,o.claimedBy||null,o.staffNotes||null,o.customerInstructions||null,JSON.stringify(o),o.assignedPrinterId||null]);
  }
  return result;
 });
}
export async function checkoutConfig(shopId:string|null){
 if(!shopId){const [rules,prices,shop]=await Promise.all([db.getRules(),db.getPricing(),db.getShopSettings()]);return {rules:{...rules,timezone:shop.timezone||'Asia/Kolkata'},prices:Object.fromEntries(Object.entries(prices).filter(([,v])=>typeof v==='number').map(([k,v])=>[k,Math.round((v as number)*100)])),upiQr:false,cash:shop.enableCashPayment!==false,online:shop.enableOnlinePayment!==false&&!!(await db.getRazorpayConfig()).keySecret};}
 const [rules,prices,settings,shop,pay]=await Promise.all([getPrintRules(shopId),getCurrentPrices(shopId),getShopSettings(shopId),getShopById(shopId),getPaymentConfig(shopId)]);
 if(!rules||!settings||!shop)throw Error('Shop not configured.');
 return {rules:{maxCopies:rules.max_copies,maxPages:rules.max_pages,maxUploadSizeMB:rules.max_upload_size_mb,maxDocumentsPerOrder:rules.max_docs_per_order,allowedPaperSizes:rules.allowed_paper_sizes,allowedColorModes:rules.allowed_color_modes,allowDuplex:rules.allow_duplex,allowedFinishing:rules.allowed_finishing,slotCapacity:rules.slot_capacity,slotPageCapacity:(rules as any).slot_page_capacity,slotDurationMinutes:rules.slot_duration_minutes,minPrepMinutes:rules.min_prep_minutes,workingHoursStart:rules.working_hours_start,workingHoursEnd:rules.working_hours_end,timezone:shop.timezone,acceptingOrders:settings.accepting_orders&&shop.status!=='paused'},prices,upiQr:shop.subdomain==='krishna',cash:settings.enable_cash,online:settings.enable_online&&!!pay?.is_configured};
}
