import { NextResponse } from 'next/server';
import fs from 'fs';import path from 'path';
import { documentDirectory } from '@/lib/documents-local';
import { isLocalOperator,isAgent,isLocalMode,verifyAgentToken } from '@/lib/access';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requireStaff} from '@/lib/auth/permissions';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: {params:Promise<{slug:string[]}>}) {
 if(!isLocalMode()){
  try{
   const shopId=request.headers.get('x-shop-id');if(!shopId)throw Error();
   const agent=await verifyAgentToken(request);if(agent){if(agent.shopId!==shopId)throw Error();}else requireStaff(await getSessionWithShop(request));
   const {slug}=await context.params;if(slug.length!==1)throw Error();
   const {getDocumentMetadata,parseFileUrl}=await import('@/lib/documents');const doc=await getDocumentMetadata(parseFileUrl('/api/file/'+slug[0]),shopId);
   const bytes=await (await import('@/lib/storage')).downloadObject(doc.storageKey);
   return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch{return NextResponse.json({error:'Document unavailable or access denied.'},{status:403});}
 }
 if (!isLocalOperator(request)&&!isAgent(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
 const {slug}=await context.params;
 if(slug.length!==1||!/^[0-9a-f-]{36}$/.test(slug[0])) return new Response('Not found',{status:404});
 try {return new Response(fs.readFileSync(path.join(documentDirectory(),slug[0]+'.pdf')),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 catch{return new Response('Not found',{status:404});}
}

