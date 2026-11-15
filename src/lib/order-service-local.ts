import crypto from 'node:crypto';
import {db} from './db';
import {documentMetadata} from './documents-local';
import {Order} from './types';
export async function createPrintOrder(input:any):Promise<Order>{
 const checkoutKey=input.checkoutKey;
 if(checkoutKey!==undefined && (typeof checkoutKey!=='string'||! /^[a-zA-Z0-9-]{32,64}$/.test(checkoutKey)))throw Error('Invalid checkout key.');
 const requestFingerprint=crypto.createHash('sha256').update(JSON.stringify([input.fileUrl,input.customerName,input.customerPhone,input.copies,input.paperSize,input.colorMode,input.duplex,input.orientation,input.paymentMethod,input.couponCode,input.customerInstructions,input.pageRange,input.finishing,input.docs])).digest('hex');
 if(checkoutKey){const existing=(await db.getOrders()).find(o=>o.checkoutKey===checkoutKey);if(existing){if(existing.requestFingerprint!==requestFingerprint)throw Error('Checkout already submitted with different settings.');return existing;}}
 if((await db.kvGet('launch'))?.enabled)throw Error('Use the current checkout flow while the staged pilot is enabled.');
 const rules=await db.getRules();const pricing=await db.getPricing();const doc=documentMetadata(input.fileUrl);
 if((rules as any).acceptingOrders===false)throw Error('The shop has paused new orders. Please try later.');
 const phone=String(input.customerPhone||'').replace(/[^\d+]/g,'');if(!/^\+?\d{10,15}$/.test(phone)||(await db.getBlockedPhones()).includes(phone))throw Error('Enter an allowed valid phone number.');
 const copies=Number(input.copies);if(!Number.isSafeInteger(copies)||copies<1||copies>rules.maxCopies)throw Error('Invalid copy count.');
 if(!rules.allowedPaperSizes.includes(input.paperSize)||!rules.allowedColorModes.includes(input.colorMode)||!['simplex','duplex'].includes(input.duplex)||(input.duplex==='duplex'&&!rules.allowDuplex)||!['portrait','landscape'].includes(input.orientation))throw Error('Unsupported print settings.');
 if(doc.pages>rules.maxPages||doc.size>rules.maxUploadSizeMB)throw Error('Document exceeds shop limits.');
 if(input.pageRange?.trim()||(input.finishing&&input.finishing!=='none')||(input.docs&&input.docs.length!==1))throw Error('This edition supports one complete PDF per order without finishing.');
 const shop=await db.getShopSettings();if((input.paymentMethod==='cash'&&shop.enableCashPayment===false)||(input.paymentMethod==='online'&&shop.enableOnlinePayment===false))throw Error('Selected payment method is unavailable.');
 if(!['cash','online'].includes(input.paymentMethod))throw Error('Invalid payment method.');
 if(input.paymentMethod==='online'){const p=await db.getRazorpayConfig();if(!p.keyId||!p.keySecret)throw Error('Online payments are unavailable.');}
 const key=`${input.paperSize}_${input.colorMode==='color'?'Color':'BW'}`;const rate=(pricing as any)[key];if(typeof rate!=='number')throw Error('Print price is unavailable.');
 let amount=doc.pages*copies*rate;let couponCode:string|undefined;
 if(input.couponCode){const c=(await db.getCoupons()).find(c=>c.code===input.couponCode&&c.isActive);if(!c)throw Error('Invalid coupon.');amount*=1-c.discountPercent/100;couponCode=c.code;}
 amount=Math.round(amount*100)/100;if(amount<1)throw Error('Order total must be at least ₹1.');
 const now=new Date().toISOString();const order:Order={id:crypto.randomUUID(),customerName:String(input.customerName||'Customer').slice(0,100),customerPhone:phone,fileName:doc.fileName,fileUrl:doc.fileUrl,fileSize:doc.size,pages:doc.pages,copies,paperSize:input.paperSize,colorMode:input.colorMode,duplex:input.duplex,orientation:input.orientation,amount,status:input.paymentMethod==='cash'?'waiting_cash':'pending',paymentMethod:input.paymentMethod,isPaid:false,source:input.source==='counter'?'counter':input.source==='whatsapp'?'whatsapp':'web',pickupCode:crypto.randomBytes(5).toString('hex'),createdAt:now,updatedAt:now,couponCode};
 return db.saveOrder({...order,checkoutKey,requestFingerprint,trackingToken:crypto.randomBytes(32).toString('hex'),collectionStatus:'pending',customerInstructions:String(input.customerInstructions||'').slice(0,300)});
}
export async function recordCapturedPayment(orderId:string,payment:any){
 const existing=(await db.getOrders()).find(o=>o.id===orderId);
 if(existing?.quoteId)return (await import('./checkout-service')).captureCheckoutPayment(null,orderId,payment);
 const rules=await db.getRules();return db.mutateOrder(orderId,o=>{
 if(payment.order_id!==o.razorpayOrderId||Number(payment.amount)!==Math.round(o.amount*100)||payment.currency!=='INR'||payment.status!=='captured')throw Error('Captured payment does not match the order.');
 if(o.isPaid){if(o.paymentId!==payment.id)throw Error('Different payment already recorded.');return o;}
 if(o.status!=='pending')throw Error('Order requires payment reconciliation.');
 return {...o,isPaid:true,paidAt:new Date().toISOString(),paymentId:payment.id,status:rules.printMode==='assisted'||o.pages>rules.autoApprovalPageLimit?'waiting_approval':'queued'};
 });}

