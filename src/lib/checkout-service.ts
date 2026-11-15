import {enforceLaunch} from './launch';
import {staffFulfilment,audit} from './fulfilment';
import {db} from './db';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {documentMetadata,documentDirectory,storeDocument as storeLocal} from './documents-local';
import {getDocumentMetadata,parseFileUrl,storeDocument} from './documents';
import {downloadObject} from './storage';
import {isPhoneBlocked} from './db/shops';
import {checkoutConfig,checkoutTransaction} from './checkout-store';
import {Quote,priceItem,scheduleSlots,availableSlot} from './checkout-domain';
const token=()=>crypto.randomBytes(32).toString('hex');
function liveQuote(quotes:Quote[],id:string){const q=quotes.find(q=>q.id===id);if(!q)throw Error('Quote not found.');if(!q.orderId&&Date.parse(q.expiresAt)<=Date.now())throw Error('Quote expired. Review a fresh price before placing your order.');return q;}
export async function createQuote(shopId:string|null,input:any){
 const config=await checkoutConfig(shopId);if(config.rules.acceptingOrders===false)throw Error('The shop has paused new orders.');
 if(!Array.isArray(input.docs)||!input.docs.length||input.docs.length>Math.min(config.rules.maxDocumentsPerOrder??10,10))throw Error('Choose between 1 and 10 documents, within the shop limit.');
 const items=[];
 for(const selection of input.docs){
  const stored=shopId?await getDocumentMetadata(parseFileUrl(selection.fileUrl),shopId):documentMetadata(selection.fileUrl);
  const meta={fileName:stored.fileName,pages:stored.pages,size:shopId?stored.sizeBytes/1048576:stored.size};
  const item=priceItem(selection,meta,config.rules,config.prices);
  // The print artifact contains only selected pages, in the exact requested order.
  if(item.selectedPages.length!==stored.pages || item.selectedPages.some((page,index)=>page!==index)){
   const bytes=shopId?await downloadObject(stored.storageKey):fs.readFileSync(path.join(documentDirectory(),stored.id+'.pdf'));
   const source=await PDFDocument.load(bytes),output=await PDFDocument.create();
   for(const p of await output.copyPages(source,item.selectedPages))output.addPage(p);
   const rendered=await output.save();
   const file=shopId?await storeDocument(rendered,item.fileName,shopId,{maxMB:50,maxPages:config.rules.maxPages}):await storeLocal(rendered,item.fileName,50,config.rules.maxPages);
   item.fileUrl=file.fileUrl;
  }
  items.push(item);
 }
 const quote:Quote={id:token(),items,amountPaise:items.reduce((s,i)=>s+i.amountPaise,0),units:items.reduce((s,i)=>s+i.pages*i.copies+(i.finishing==='none'?0:20*i.copies),0),createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+10*60000).toISOString()};
 if(quote.amountPaise<100)throw Error('The minimum order total is ₹1.');
 return checkoutTransaction(shopId,async state=>{for(let i=state.quotes.length-1;i>=0;i--)if(!state.quotes[i].orderId&&Date.parse(state.quotes[i].expiresAt)<=Date.now())state.quotes.splice(i,1);state.quotes.push(quote);return quote;});
}
export async function pickupSlots(shopId:string|null,quoteId:string){
 const {rules}=await checkoutConfig(shopId);const slots=scheduleSlots(rules);
 return checkoutTransaction(shopId,async s=>{const q=liveQuote(s.quotes,quoteId);return {timezone:rules.timezone,slots:slots.filter(at=>availableSlot(at,q,s.quotes,s.orders,rules)).slice(0,100)};});
}
export async function reservePickup(shopId:string|null,quoteId:string,at:string){
 const {rules}=await checkoutConfig(shopId);if(!scheduleSlots(rules).includes(at))throw Error('Select a future pickup slot within shop hours.');
 return checkoutTransaction(shopId,async s=>{const q=liveQuote(s.quotes,quoteId);if(q.orderId)throw Error('Order already placed. Use its tracking page to change pickup.');if(!availableSlot(at,q,s.quotes,s.orders,rules))throw Error('This slot just filled. Choose another pickup time.');q.reservation={id:token(),requestedAt:at,expiresAt:new Date(Math.min(Date.parse(q.expiresAt),Date.now()+10*60000)).toISOString()};return q.reservation;});
}
export async function placeCheckout(shopId:string|null,input:any){
 const blocked=shopId?[]:await db.getBlockedPhones();
 const config=await checkoutConfig(shopId);
 return checkoutTransaction(shopId,async s=>{
  const q=liveQuote(s.quotes,input.quoteId);if(q.orderId)return s.orders.find(o=>o.id===q.orderId);
  enforceLaunch(s.launch,s.orders,input);
  if(config.rules.acceptingOrders===false)throw Error('The shop has paused new orders.');
  if(!q.reservation||Date.parse(q.reservation.expiresAt)<=Date.now())throw Error('Pickup reservation expired. Please select a new slot.');
  if(!['cash','online','upi_qr'].includes(input.paymentMethod)||(input.paymentMethod==='upi_qr'&&!config.upiQr)||(input.paymentMethod==='cash'&&!config.cash)||(input.paymentMethod==='online'&&!config.online))throw Error('Selected payment method is unavailable.');
  const phone=String(input.customerPhone||'').trim();if(!/^\+?\d{10,15}$/.test(phone)||blocked.includes(phone)||(shopId&&await isPhoneBlocked(shopId,phone)))throw Error('Enter a valid phone number.');
  const first=q.items[0];const now=new Date().toISOString();
  const order:any={synthetic:!!s.launch?.enabled&&(s.launch.stage??0)===0,id:crypto.randomUUID(),quoteId:q.id,trackingToken:token(),pickupCode:crypto.randomBytes(4).toString('hex').toUpperCase(),customerName:String(input.customerName||'Customer').trim().slice(0,100),customerPhone:phone,customerInstructions:String(input.customerInstructions||'').slice(0,500),fileUrl:first.fileUrl,fileName:q.items.length===1?first.fileName:`${q.items.length} documents`,fileSize:q.items.reduce((s,i)=>s+i.fileSize,0),pages:q.items.reduce((s,i)=>s+i.pages*i.copies,0),copies:1,paperSize:first.paperSize,colorMode:first.colorMode,duplex:first.duplex,orientation:first.orientation,documents:q.items.map(i=>({...i,itemAmountPaise:i.amountPaise})),amount:q.amountPaise/100,amountPaise:q.amountPaise,capacityUnits:q.units,timezone:config.rules.timezone,paymentMethod:input.paymentMethod,source:input.source==='counter'?'counter':'web',isPaid:false,status:input.paymentMethod!=='online'?'waiting_cash':'pending',collectionStatus:'pending',requestedPickupAt:q.reservation.requestedAt,confirmedPickupAt:undefined,reservationExpiresAt:input.paymentMethod!=='online'?q.reservation.requestedAt:new Date(Date.now()+10*60000).toISOString(),createdAt:now,updatedAt:now};
  s.orders.unshift(order);q.orderId=order.id;return order;
 });
}
export async function changePickup(shopId:string|null,trackingToken:string,at?:string,confirm=false){
 const {rules}=await checkoutConfig(shopId);const slots=scheduleSlots(rules);
 return checkoutTransaction(shopId,async s=>{
  const o=s.orders.find(o=>o.trackingToken===trackingToken);if(!o||!o.quoteId)throw Error('Order not found.');
  if(!['pending','waiting_cash','waiting_approval'].includes(o.status))throw Error('Contact the shop to change pickup for this order.');
  const q=s.quotes.find(q=>q.id===o.quoteId)!;const others=s.orders.filter(x=>x.id!==o.id);
  if(!at)return {timezone:rules.timezone,slots:slots.filter(t=>availableSlot(t,q,s.quotes,others,rules)).slice(0,100)};
  if(!slots.includes(at)||!availableSlot(at,q,s.quotes,others,rules))throw Error('Pickup time is no longer available.');
  if(confirm&&!o.isPaid)throw Error('Record or verify payment before confirming pickup.');
  o.requestedPickupAt=confirm?o.requestedPickupAt:at;o.confirmedPickupAt=confirm?at:undefined;o.pickupNeedsReschedule=false;
  o.reservationExpiresAt=o.isPaid?undefined:(o.paymentMethod!=='online'?at:new Date(Date.now()+10*60000).toISOString());
  if(confirm){o.status='queued';audit(o,'reviewed_payment_and_pickup_confirmed','staff');}o.updatedAt=new Date().toISOString();return o;
 });
}
export async function captureCheckoutPayment(shopId:string|null,orderId:string,payment:any){
 return checkoutTransaction(shopId,async s=>{
  const o=s.orders.find(o=>o.id===orderId);if(!o||payment.order_id!==o.razorpayOrderId||payment.currency!=='INR'||payment.status!=='captured'||Number(payment.amount)!==Math.round(o.amount*100))throw Error('Payment does not match the order.');
  if(o.isPaid){if(o.paymentId!==payment.id)throw Error('Another payment was already recorded.');return o;}
  const expired=!(Date.parse(o.reservationExpiresAt||'')>Date.now());
  o.isPaid=true;o.paidAt=new Date().toISOString();o.paymentId=payment.id;o.pickupNeedsReschedule=expired;o.confirmedPickupAt=undefined;o.status=o.status==='cancelled'?'cancelled':'waiting_approval';o.updatedAt=new Date().toISOString();return o;
 });
}
export async function updateCheckoutOrder(shopId:string|null,id:string,body:any){
 return checkoutTransaction(shopId,async s=>{
  const o=s.orders.find(o=>o.id===id);if(!o?.quoteId)throw Error('Order not found.');
  if(o.refundState)throw Error('Refunded order cannot be changed.');
  if(body.status==='ready'||body.status==='collected')return staffFulfilment(o,{...body,action:body.status==='ready'?'ready':'collect'},'staff');
  if(body.status&&body.status!==o.status){
   if(body.status==='queued'){
    if(o.status==='waiting_cash'&&['cash','upi_qr'].includes(o.paymentMethod)){o.isPaid=true;o.paidAt=new Date().toISOString();o.paymentId=o.paymentMethod+':'+o.id;audit(o,o.paymentMethod==='upi_qr'?'upi_receipt_verified':'cash_received','staff',{amountPaise:o.amountPaise});o.status='waiting_approval';o.pickupNeedsReschedule=!(Date.parse(o.reservationExpiresAt||'')>Date.now());}
    else throw Error('Confirm an available pickup time before queueing this order.');
   }else if(body.status==='ready'&&o.status==='submitted'){
    if(o.documents.some((d:any)=>d.finishing!=='none')&&body.finishingConfirmed!==true)throw Error('Confirm all requested finishing is complete before marking ready.');
    o.status='ready';o.collectionStatus='ready';
   }else if(body.status==='collected'&&o.status==='ready'){
    if(!o.isPaid||body.pickupCode!==o.pickupCode)throw Error('Verify payment and customer pickup code.');o.status='collected';o.collectionStatus='collected';
   }else if(body.status==='cancelled'&&['pending','waiting_cash','waiting_approval','queued'].includes(o.status)){o.status='cancelled';o.paymentReviewRequired=!!o.isPaid;audit(o,'cancelled','staff',{paymentReviewRequired:o.paymentReviewRequired});}
   else throw Error('Invalid order transition.');
  }
  if(body.staffNotes!==undefined)o.staffNotes=String(body.staffNotes).slice(0,2000);
  o.updatedAt=new Date().toISOString();return o;
 });
}
export function customerOrder(o:any){
 return {id:o.id,trackingToken:o.trackingToken,quoteId:o.quoteId,timezone:o.timezone,status:o.status,isPaid:o.isPaid,amount:o.amount,amountPaise:o.amountPaise,paymentMethod:o.paymentMethod,fileName:o.fileName,pages:o.pages,copies:o.copies,createdAt:o.createdAt,refundState:o.refundState,requestedPickupAt:o.requestedPickupAt,confirmedPickupAt:o.confirmedPickupAt,reservationExpiresAt:o.reservationExpiresAt,pickupNeedsReschedule:o.pickupNeedsReschedule,collectionStatus:o.collectionStatus,pickupCode:o.status==='ready'?o.pickupCode:undefined,documents:o.documents?.map((d:any)=>({fileName:d.fileName,pages:d.pages,copies:d.copies,colorMode:d.colorMode,paperSize:d.paperSize,duplex:d.duplex,finishing:d.finishing,itemAmountPaise:d.itemAmountPaise}))};
}
