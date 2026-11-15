import { NextResponse } from 'next/server';
import { clearSessionCookie, revokeSession, SESSION_COOKIE } from '@/lib/auth/sessions';
import { isLocalMode } from '@/lib/access';
export async function POST(request:Request) {
  try {
    if(!isLocalMode()) {
      const value=(request.headers.get('cookie')||'').split(';').find(p=>p.trim().startsWith(SESSION_COOKIE+'='));
      if(value) await revokeSession(decodeURIComponent(value.trim().slice(SESSION_COOKIE.length+1)));
    }
    return NextResponse.json({success:true},{headers:{'Set-Cookie':clearSessionCookie(),'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Could not sign out. Retry.'},{status:503}); }
}
