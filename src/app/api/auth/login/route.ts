import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { isLocalMode } from '@/lib/access';
import { query, queryOne } from '@/lib/db/client';
import { verifyPassword, hashPassword } from '@/lib/auth/passwords';
import { buildSessionCookie, createSession } from '@/lib/auth/sessions';

const dummyHash = hashPassword('not-a-valid-account-password');
export async function POST(request: Request) {
  if (isLocalMode()) return NextResponse.json({error:'Login is paused in local mode.'},{status:409});
  try {
    const { email, password } = await request.json();
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || Buffer.byteLength(password) > 72) return NextResponse.json({error:'Invalid credentials.'},{status:401});
    const shopId = request.headers.get('x-shop-id');
    const admin = request.headers.get('x-admin-request') === '1';
    if (!shopId && !admin) return NextResponse.json({error:'Shop not found.'},{status:404});
    const normalized = email.trim().toLowerCase();
    const key = crypto.createHash('sha256').update(`${shopId || 'admin'}:${normalized}`).digest('hex');
    const limit = await queryOne<{attempts:number}>(`INSERT INTO login_limits(key,attempts,window_start) VALUES ($1,1,now())
      ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN login_limits.window_start < now()-interval '15 minutes' THEN 1 ELSE login_limits.attempts+1 END,
      window_start=CASE WHEN login_limits.window_start < now()-interval '15 minutes' THEN now() ELSE login_limits.window_start END RETURNING attempts`,[key]);
    if (!limit || limit.attempts > 10) return NextResponse.json({error:'Too many login attempts. Try again in 15 minutes.'},{status:429,headers:{'Retry-After':'900'}});
    const user = await queryOne<{id:string;password_hash:string;is_suspended:boolean;is_platform_admin:boolean}>('SELECT id,password_hash,is_suspended,is_platform_admin FROM users WHERE lower(email)=$1',[normalized]);
    const valid = await verifyPassword(password,user?.password_hash || await dummyHash);
    const member = user && shopId ? await queryOne('SELECT role FROM shop_memberships WHERE user_id=$1 AND shop_id=$2 AND joined_at IS NOT NULL',[user.id,shopId]) : null;
    if (!valid || !user || user.is_suspended || (admin && !user.is_platform_admin) || (shopId && !member && !user.is_platform_admin)) return NextResponse.json({error:'Invalid credentials or access.'},{status:401});
    const token = await createSession(user.id,shopId,{userAgent:request.headers.get('user-agent')?.slice(0,512)});
    await query('UPDATE users SET last_login_at=now() WHERE id=$1',[user.id]);
    return NextResponse.json({success:true,redirect:admin?'/admin':'/shop'},{headers:{'Set-Cookie':buildSessionCookie(token),'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Login temporarily unavailable.'},{status:503}); }
}
