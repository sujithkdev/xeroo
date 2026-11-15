import {paymentShop,paymentConfig,paymentOrder} from '@/lib/payment-context';
import {captureCheckoutPayment} from '@/lib/checkout-service';
import { NextResponse } from 'next/server';import crypto from 'crypto';import Razorpay from 'razorpay';
import { db } from '@/lib/db';import { recordCapturedPayment } from '@/lib/order-service-local';
export async function POST(request:Request){
 try{const shopId=paymentShop(request);const body=await request.json();const order=await paymentOrder(shopId,body.orderId);const config=await paymentConfig(shopId);
 if(!order?.razorpayOrderId||body.razorpay_order_id!==order.razorpayOrderId||!config.keySecret)throw new Error('Unknown payment order');
 const expected=crypto.createHmac('sha256',config.keySecret).update(order.razorpayOrderId+'|'+body.razorpay_payment_id).digest('hex');
 if(typeof body.razorpay_signature!=='string'||!/^[a-f0-9]{64}$/.test(body.razorpay_signature)||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(body.razorpay_signature)))throw new Error('Invalid signature');
 const client=new Razorpay({key_id:config.keyId,key_secret:config.keySecret});const payment=await client.payments.fetch(body.razorpay_payment_id);
 if(order.quoteId)await captureCheckoutPayment(shopId,order.id,payment);else await recordCapturedPayment(order.id,payment);return NextResponse.json({success:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Verification failed'},{status:400});}
}

