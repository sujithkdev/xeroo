import crypto from 'node:crypto';
import {NextResponse} from 'next/server';
import {isLocalMode} from '@/lib/access';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requireOwner,AuthError} from '@/lib/auth/permissions';
import {query,withTransaction} from '@/lib/db/client';
export const dynamic='force-dynamic';
async function owner(request:Request){
 if(isLocalMode())throw new AuthError(409,'Computer registration requires a hosted shop account.');
 const session=await getSessionWithShop(request);requireOwner(session);return session;
}
const fail=(e:unknown)=>NextResponse.json({error:e instanceof Error?e.message:'Device operation failed'},{status:e instanceof AuthError?e.status:400});
export async function GET(request:Request){try{
 const s=await owner(request);
 return NextResponse.json({devices:await query('SELECT id,label,last_seen_at,pc_name,agent_version,is_revoked FROM agents WHERE shop_id=$1 ORDER BY created_at DESC',[s.shopId])},{headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 const s=await owner(request),body=await request.json();
 const label=String(body.label||'Counter PC').trim();if(!label||label.length>100)throw Error('Computer name must be 1–100 characters.');
 const token=crypto.randomBytes(32).toString('hex');
 const device=await withTransaction(async c=>{
  await c.query('SELECT id FROM shops WHERE id=$1 FOR UPDATE',[s.shopId]);
  if((await c.query('SELECT id FROM agents WHERE shop_id=$1 AND NOT is_revoked',[s.shopId])).rowCount)throw new AuthError(409,'A printing computer is already registered. Revoke it in Computer setup before registering a replacement.');
  return (await c.query('INSERT INTO agents(shop_id,label,token_hash) VALUES($1,$2,$3) RETURNING id,label',[s.shopId,label,crypto.createHash('sha256').update(token).digest('hex')])).rows[0];
 });
 return NextResponse.json({device,token},{status:201,headers:{'Cache-Control':'no-store'}});
}catch(e){return fail(e);}}
export async function DELETE(request:Request){try{
 const s=await owner(request),{id}=await request.json();
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid computer.');
 const rows=await query('UPDATE agents SET is_revoked=true WHERE id=$1 AND shop_id=$2 RETURNING id',[id,s.shopId]);
 if(!rows.length)throw new AuthError(404,'Computer not found.');
 return NextResponse.json({success:true});
}catch(e){return fail(e);}}
