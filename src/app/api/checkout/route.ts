import {NextResponse} from 'next/server';
import {boundedBody,limitExpensiveRequest,RequestLimitError} from '@/lib/request-limits';
import {isLocalMode,isLocalOperator} from '@/lib/access';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requireStaff,AuthError} from '@/lib/auth/permissions';
import {createQuote,pickupSlots,reservePickup,placeCheckout,changePickup} from '@/lib/checkout-service';
export async function POST(request:Request){
 try{
  const shopId=isLocalMode()?null:request.headers.get('x-shop-id');
  if(!isLocalMode()&&!shopId)return NextResponse.json({error:'Shop not found.'},{status:404});
  await limitExpensiveRequest(shopId,'checkout');
  const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,65536)));
  if(body.action==='confirmPickup'||body.source==='counter'){
   if(isLocalMode()){if(!isLocalOperator(request))throw new AuthError(401,'Staff access required.');}else requireStaff(await getSessionWithShop(request));
  }
  let data;
  switch(body.action){
   case 'quote':data=await createQuote(shopId,body);break;
   case 'slots':data=await pickupSlots(shopId,body.quoteId);break;
   case 'reserve':data=await reservePickup(shopId,body.quoteId,body.requestedAt);break;
   case 'place':data=await placeCheckout(shopId,body);break;
   case 'reschedule':data=await changePickup(shopId,body.trackingToken,body.requestedAt);break;
   case 'confirmPickup':data=await changePickup(shopId,body.trackingToken,body.confirmedAt,true);break;
   default:throw Error('Unknown checkout action.');
  }
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Checkout failed.'},{status:e instanceof AuthError||e instanceof RequestLimitError?e.status:409,headers:e instanceof RequestLimitError&&e.status===429?{'Retry-After':'60'}:{}});}
}
