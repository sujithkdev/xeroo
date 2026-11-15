import {onboardShop} from '@/lib/onboarding';
import {NextResponse} from 'next/server';
import {isLocalOperator,isLocalMode} from '@/lib/access';
import {db} from '@/lib/db';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requirePlatformAdmin,AuthError} from '@/lib/auth/permissions';
import {getAllShops} from '@/lib/db/shops';
import {withTransaction} from '@/lib/db/client';
import crypto from 'node:crypto';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try {
  if(isLocalMode()){if(!isLocalOperator(request))return NextResponse.json({error:'Unauthorized'},{status:401});const settings=await db.getShopSettings();return NextResponse.json({shops:[{id:'local',...settings,status:'active',shopUrl:'/shop'}]});}
  requirePlatformAdmin(await getSessionWithShop(request));
  return NextResponse.json({shops:await getAllShops()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof AuthError?e.message:'Could not load shops.'},{status:e instanceof AuthError?e.status:503});}
}

export async function POST(request:Request){try{
 if(isLocalMode())return NextResponse.json({error:'Shop onboarding requires multi-shop PostgreSQL mode. Open the configured admin subdomain on port 3001 locally.'},{status:409});
 const session=await getSessionWithShop(request);requirePlatformAdmin(session);
 const domain=process.env.APP_DOMAIN;if(!domain)throw Error('Base domain is not configured.');
 const result=await onboardShop(await request.json(),session!.userId);
 const source=new URL(request.url);const host=request.headers.get('host')||'';const port=host.match(/:\d+$/)?.[0]||'';
 const origin=(domain.endsWith('.localhost')?'http:':'https:')+'//'+result.shop.subdomain+'.'+domain+(domain.endsWith('.localhost')?port:'');
 return NextResponse.json({success:true,shop:result.shop,invitationUrl:origin+'/invite/'+result.token,delivery:'manual',expiresInHours:48},{headers:{'Cache-Control':'no-store'}});
 }catch(e:any){return NextResponse.json({error:e.code==='23505'?'Subdomain already exists.':e.message||'Shop creation failed.'},{status:e instanceof AuthError?e.status:409});}}

export async function PATCH(request:Request){try{
 if(isLocalMode())throw new AuthError(409,'Shop administration requires hosted mode.');
 const session=await getSessionWithShop(request);requirePlatformAdmin(session);
 const {id,action,reason}=await request.json();
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id)||!['suspend','reactivate','renew_invitation'].includes(action))throw Error('Invalid shop action.');
 const result=await withTransaction(async c=>{
  const shop=(await c.query('SELECT * FROM shops WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!shop)throw new AuthError(404,'Shop not found.');
  if(action==='renew_invitation'){
   if((await c.query("SELECT 1 FROM shop_memberships WHERE shop_id=$1 AND role='owner' AND joined_at IS NOT NULL",[id])).rowCount)throw Error('The owner has already activated their account.');
   const token=crypto.randomBytes(32).toString('hex');
   await c.query("DELETE FROM invitations WHERE shop_id=$1 AND role='owner' AND accepted_at IS NULL",[id]);
   await c.query("INSERT INTO invitations(shop_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,'owner',$3,$4,now()+interval '48 hours')",[id,shop.email,crypto.createHash('sha256').update(token).digest('hex'),session!.userId]);
   const domain=process.env.APP_DOMAIN!;const port=(request.headers.get('host')||'').match(/:\d+$/)?.[0]||'';
   return {invitationUrl:`${domain.endsWith('.localhost')?'http':'https'}://${shop.subdomain}.${domain}${domain.endsWith('.localhost')?port:''}/invite/${token}`,delivery:'manual'};
  }
  if(typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw Error('Enter a reason of 5–500 characters.');
  const status=action==='suspend'?'suspended':'testing';
  await c.query('UPDATE shops SET status=$2,updated_at=now() WHERE id=$1',[id,status]);
  await c.query('UPDATE shop_settings SET accepting_orders=false,auto_print_enabled=false WHERE shop_id=$1',[id]);
  await c.query("INSERT INTO audit_logs(actor_id,actor_role,shop_id,action,target_type,target_id,outcome,reason) VALUES($1,'platform_admin',$2,$3,'shop',$2,'success',$4)",[session!.userId,id,action,reason.trim()]);
  return {status};
 });
 return NextResponse.json({success:true,...result},{headers:{'Cache-Control':'no-store'}});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Shop update failed'},{status:e instanceof AuthError?e.status:400});}}
