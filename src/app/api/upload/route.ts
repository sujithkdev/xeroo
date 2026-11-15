import { NextResponse } from 'next/server';
import {boundedBody,limitExpensiveRequest,RequestLimitError} from '@/lib/request-limits';
import { db } from '@/lib/db';
import { storeDocument } from '@/lib/documents-local';
import {isLocalMode} from '@/lib/access';
import {checkoutConfig} from '@/lib/checkout-store';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
 try {
  const shopId=isLocalMode()?null:request.headers.get('x-shop-id');
  if(!isLocalMode()&&!shopId)throw Error('Shop not found.');
  await limitExpensiveRequest(shopId,'upload');
  const rules = shopId?(await checkoutConfig(shopId)).rules:await db.getRules();
  if (Number(request.headers.get('content-length') || 0) > Math.min(rules.maxUploadSizeMB,50)*1024*1024+65536) return NextResponse.json({error:'Upload too large'},{status:413});
  const body=await boundedBody(request,Math.min(rules.maxUploadSizeMB,50)*1024*1024+65536);
  const form = await new Response(new Uint8Array(body),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData(); const file = form.get('file');
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf')) return NextResponse.json({error:'Upload a PDF. Convert other formats to PDF first.'},{status:400});
  const bytes=new Uint8Array(await file.arrayBuffer());
  const doc = shopId?await (await import('@/lib/documents')).storeDocument(bytes,file.name,shopId,{maxMB:rules.maxUploadSizeMB,maxPages:rules.maxPages}):await storeDocument(bytes,file.name,rules.maxUploadSizeMB,rules.maxPages);
  return NextResponse.json({success:true,...doc});
 } catch(error) {return NextResponse.json({error:error instanceof Error?error.message:'Upload failed'},{status:error instanceof RequestLimitError?error.status:400,headers:error instanceof RequestLimitError&&error.status===429?{'Retry-After':'60'}:{}});}
}

