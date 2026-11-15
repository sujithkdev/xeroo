import crypto from 'node:crypto';
import {isLocalMode} from './access';
import {db} from './db';
import {getPaymentConfig} from './db/shops';
import {checkoutTransaction} from './checkout-store';
export function encryptPaymentSecret(value:string){const key=process.env.PAYMENTS_ENCRYPTION_KEY;if(!key||!/^[a-f0-9]{64}$/i.test(key))throw Error('Configure PAYMENTS_ENCRYPTION_KEY before saving provider secrets.');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),bytes.toString('hex')].join('.');}
function decrypt(value:string|null){if(!value)return '';const key=process.env.PAYMENTS_ENCRYPTION_KEY;if(!key)throw Error('Payment configuration is unavailable.');const [iv,tag,data]=value.split('.');const cipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));cipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([cipher.update(Buffer.from(data,'hex')),cipher.final()]).toString('utf8');}
export async function paymentConfig(shopId:string|null){if(!shopId)return db.getRazorpayConfig();const c=await getPaymentConfig(shopId);return {keyId:c?.razorpay_key_id||'',keySecret:decrypt(c?.razorpay_key_secret_enc||null),webhookSecret:decrypt(c?.razorpay_webhook_secret_enc||null)};}
export function paymentShop(request:Request){const id=isLocalMode()?null:request.headers.get('x-shop-id');if(!isLocalMode()&&!id)throw Error('Shop not found.');return id;}
export async function paymentOrder(shopId:string|null,id:string){return checkoutTransaction(shopId,async s=>s.orders.find(o=>o.id===id));}
