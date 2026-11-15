import {claimPrint,reportPrint} from '@/lib/fulfilment';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { isAgent, isLocalMode, verifyAgentToken } from '@/lib/access';
import { checkoutTransaction } from '@/lib/checkout-store';
import { getShopSettings } from '@/lib/db/shops';
export const dynamic='force-dynamic';
async function context(request:Request) {
 if(isLocalMode())return isAgent(request)?{shopId:null,agentId:'local-agent'}:null;
 const agent=await verifyAgentToken(request);
 return agent&&agent.shopId===request.headers.get('x-shop-id')?agent:null;
}
export async function POST(request:Request){
 try{
 const agent=await context(request);
 if(!agent)return NextResponse.json({error:'Unauthorized agent'},{status:401});
 const body=await request.json();
 const enabled=agent.shopId?(await getShopSettings(agent.shopId))?.auto_print_enabled:await db.getAutoPrintEnabled();
 if(!enabled)throw Error('Queue paused');
 const order=await checkoutTransaction(agent.shopId,async state=>{
 const o=state.orders.find(o=>o.id===body.id);
 return claimPrint(o,agent.agentId,body.capabilities);
 });
 return NextResponse.json({success:true,order});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Claim failed'},{status:409});}
}
export async function PUT(request:Request){
 try{
 const agent=await context(request);
 if(!agent)return NextResponse.json({error:'Unauthorized agent'},{status:401});
 const body=await request.json();
 const order=await checkoutTransaction(agent.shopId,async state=>{
 const o=state.orders.find(o=>o.id===body.id);
 return reportPrint(o,agent.agentId,body);
 });return NextResponse.json({success:true,order});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Update failed'},{status:409});}
}
