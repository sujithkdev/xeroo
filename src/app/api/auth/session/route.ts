import { NextResponse } from 'next/server';
import { getSessionWithShop } from '@/lib/auth/sessions';
import { isLocalMode } from '@/lib/access';
export async function GET(request:Request) {
  if (isLocalMode()) return NextResponse.json({mode:'local',loginPaused:true},{headers:{'Cache-Control':'no-store'}});
  try {
    const session=await getSessionWithShop(request);
    if(!session) return NextResponse.json({error:'Authentication required.'},{status:401});
    return NextResponse.json({user:{id:session.userId,name:session.name,email:session.email,isPlatformAdmin:session.isPlatformAdmin,shopId:session.shopId,role:session.shopRole}},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Session unavailable.'},{status:503}); }
}
