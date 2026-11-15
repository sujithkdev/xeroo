import {NextResponse} from 'next/server';
import {isLocalMode,isLocalOperator} from '@/lib/access';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requireStaff,requireManager,AuthError} from '@/lib/auth/permissions';
import {checkoutTransaction} from '@/lib/checkout-store';
import {staffFulfilment} from '@/lib/fulfilment';
export async function POST(request:Request){try{
 const local=isLocalMode(),shopId=local?null:request.headers.get('x-shop-id');let actor='local-operator';
 if(local){if(!isLocalOperator(request))throw new AuthError(401,'Staff access required.');}
 else {const session=await getSessionWithShop(request);requireStaff(session);if(!shopId||session?.shopId!==shopId)throw new AuthError(403,'Wrong shop.');actor=session.userId;}
 const body=await request.json();if(body.action==='reconcile_payment'&&!local)requireManager(await getSessionWithShop(request));const order=await checkoutTransaction(shopId,async s=>staffFulfilment(s.orders.find(o=>o.id===body.id),body,actor));
 return NextResponse.json({success:true,order},{headers:{'Cache-Control':'no-store'}});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Fulfilment failed.'},{status:e instanceof AuthError?e.status:409});}}
