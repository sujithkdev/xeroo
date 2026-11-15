import {NextResponse} from 'next/server';
import Razorpay from 'razorpay';
import {paymentShop,paymentConfig} from '@/lib/payment-context';
import {checkoutTransaction} from '@/lib/checkout-store';
export async function POST(request:Request){try{
 const shopId=paymentShop(request),body=await request.json(),config=await paymentConfig(shopId);
 if(!config.keyId||!config.keySecret)throw Error('Online payments unavailable.');
 const client=new Razorpay({key_id:config.keyId,key_secret:config.keySecret});
 const remote:any=await checkoutTransaction(shopId,async s=>{
  const o=s.orders.find(o=>o.id===body.orderId);
  if(!o||o.isPaid||o.paymentMethod!=='online'||o.status!=='pending')throw Error('Order is not awaiting online payment.');
  if(o.quoteId&&(o.trackingToken!==body.trackingToken||Date.parse(o.reservationExpiresAt||'')<=Date.now()))throw Error('Renew your pickup reservation on the tracking page before retrying payment.');
  if(o.razorpayOrderId)return client.orders.fetch(o.razorpayOrderId);
  const r=await client.orders.create({amount:Math.round(o.amount*100),currency:'INR',receipt:o.id.slice(0,40)});o.razorpayOrderId=r.id;return r;
 });return NextResponse.json({success:true,order_id:remote.id,amount:remote.amount,currency:remote.currency});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Payment initiation failed.'},{status:409});}}
