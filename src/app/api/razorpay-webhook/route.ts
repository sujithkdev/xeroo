import {paymentShop,paymentConfig} from '@/lib/payment-context';
import {checkoutTransaction} from '@/lib/checkout-store';
import {captureCheckoutPayment} from '@/lib/checkout-service';
import { NextResponse } from 'next/server';import crypto from 'crypto';
import { db } from '@/lib/db';import { recordCapturedPayment } from '@/lib/order-service-local';
export async function POST(request:Request){
 try{const shopId=paymentShop(request);const raw=await request.text();const config=await paymentConfig(shopId);const signature=request.headers.get('x-razorpay-signature')||'';
 if(!config.webhookSecret||!/^[a-f0-9]{64}$/.test(signature))return NextResponse.json({error:'Signature required'},{status:401});
 const expected=crypto.createHmac('sha256',config.webhookSecret).update(raw).digest('hex');
 if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature)))return NextResponse.json({error:'Invalid signature'},{status:401});
 const event=JSON.parse(raw);
 if(['refund.processed','refund.failed'].includes(event.event)) {
  if(shopId)return NextResponse.json({error:'Refund reconciliation requires operator review.'},{status:409});
  const refund=event.payload?.refund?.entity;
  const order=(await db.getOrders()).find(o=>o.paymentId===refund?.payment_id && !!o.refundState);
  if(!order || refund.amount!==Math.round(order.amount*100))return NextResponse.json({error:'Refund mismatch'},{status:409});
  await db.mutateOrder(order.id,o=>{
    if(o.refundState==='processed')return o;
    if(o.refundId && o.refundId!==refund.id)throw new Error('Refund identity mismatch');
    return {...o,refundedAt:event.event==='refund.processed'?new Date().toISOString():o.refundedAt,refundId:refund.id,refundState:event.event==='refund.processed'?'processed':'needs_review',status:'cancelled'};
  });return NextResponse.json({success:true});
 }
 if(event.event!=='payment.captured')return NextResponse.json({success:true});
 const payment=event.payload?.payment?.entity;const order=await checkoutTransaction(shopId,async s=>s.orders.find(o=>o.razorpayOrderId===payment?.order_id));
 if(!order)return NextResponse.json({error:'Unknown order; retry later'},{status:409});
 if(order.quoteId)await captureCheckoutPayment(shopId,order.id,payment);else await recordCapturedPayment(order.id,payment);return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Webhook failed'},{status:400});}
}

