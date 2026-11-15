import {NextResponse} from 'next/server';
import {isLocalMode,isLocalOperator} from '@/lib/access';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requireStaff,requireManager,AuthError} from '@/lib/auth/permissions';
import {checkoutTransaction} from '@/lib/checkout-store';
import {launchMetrics,mutateLaunch,stages,gates} from '@/lib/launch';
async function context(r:Request,write=false){if(isLocalMode()){if(!isLocalOperator(r))throw new AuthError(401,'Staff access required.');return {shopId:null,actor:'local-operator',canManage:true};}const session=await getSessionWithShop(r);requireStaff(session);if(write)requireManager(session);return {shopId:session.shopId,actor:session.userId,canManage:session.isPlatformAdmin||['owner','manager'].includes(session.shopRole||'')};}
export async function GET(r:Request){try{const c=await context(r);const data=await checkoutTransaction(c.shopId,async s=>({launch:s.launch,metrics:launchMetrics(s.orders),stages,gates,canManage:c.canManage}));return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}catch(e){return fail(e);}}
export async function POST(r:Request){try{const c=await context(r,true),body=await r.json();const data=await checkoutTransaction(c.shopId,async s=>{if(body.action==='advance'&&launchMetrics(s.orders).paymentReviews>0)throw Error('Resolve outstanding payment reviews before expanding the pilot.');return mutateLaunch(s.launch,body,c.actor);});return NextResponse.json({success:true,launch:data});}catch(e){return fail(e);}}
function fail(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:'Launch operation failed.'},{status:e instanceof AuthError?e.status:409});}
