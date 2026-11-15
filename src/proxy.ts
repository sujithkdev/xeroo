import { NextRequest, NextResponse } from 'next/server';
import { isLocalMode, isLocalOperator } from '@/lib/access';
import { resolveTenantHost } from '@/lib/tenancy';
import { queryOne } from '@/lib/db/client';
import { getSessionWithShop } from '@/lib/auth/sessions';
export async function proxy(request: NextRequest) {
 const pathname = request.nextUrl.pathname;
 if(pathname==='/api/tls-approved')return NextResponse.next();
 const host = request.headers.get('host') || '';
 const api = pathname.startsWith('/api/');
 const headers = new Headers(request.headers);
 for (const key of ['x-shop-id', 'x-shop-subdomain', 'x-admin-request']) headers.delete(key);
 if (api && !['GET','HEAD','OPTIONS'].includes(request.method)) {
   let badOrigin = false;
   try { const origin = request.headers.get('origin'); badOrigin = !!origin && new URL(origin).host !== host; } catch { badOrigin = true; }
   if (badOrigin || request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({error:'Cross-origin write rejected'},{status:401});
 }
 if (isLocalMode()) {
   if ((pathname.startsWith('/shop') || pathname.startsWith('/admin')) && !isLocalOperator(request)) return new NextResponse('Remote console disabled while login is paused.', {status:403});
   return NextResponse.next({request:{headers}});
 }
 if (!process.env.DATABASE_URL) return new NextResponse('Multi-shop database is not configured.', {status:503});
 const tenant = resolveTenantHost(host, process.env.APP_DOMAIN || process.env.NEXT_PUBLIC_APP_DOMAIN || '');
 if (tenant.kind === 'invalid' || tenant.kind === 'root') return new NextResponse('Shop not found.', {status:404});
 try {
   if (tenant.kind === 'shop') {
     const shop = await queryOne<{id:string;status:string}>('SELECT id,status FROM shops WHERE subdomain=$1', [tenant.slug]);
     if (!shop || !['active','testing','paused'].includes(shop.status)) return new NextResponse('Shop is unavailable.', {status:404});
     headers.set('x-shop-id',shop.id); headers.set('x-shop-subdomain',tenant.slug!);
   } else headers.set('x-admin-request','1');
   if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')) && tenant.kind !== 'admin') return new NextResponse('Not found.', {status:404});
   if (pathname.startsWith('/shop') && tenant.kind !== 'shop') return new NextResponse('Not found.', {status:404});
   const protectedPage = !api && (pathname.startsWith('/shop') || pathname.startsWith('/admin')) && !['/shop/login','/admin/login'].includes(pathname);
   if (protectedPage || pathname.startsWith('/api/admin/')) {
     const session = await getSessionWithShop(new Request(request.url,{headers}));
     if (!session) {
       if (api) return NextResponse.json({error:'Authentication required.'},{status:401});
       const scheme = process.env.APP_DOMAIN?.endsWith('.localhost') ? 'http' : 'https';
       const loginPath = tenant.kind === 'admin' ? '/admin/login' : '/shop/login';
       return NextResponse.redirect(new URL(loginPath, scheme + '://' + host), {status:307,headers:{'Cache-Control':'no-store'}});
     }
     if (/^\/shop\/(daily-report|reports|analytics|payments|settings|pricing|rules)(\/|$)/.test(pathname) && !session.isPlatformAdmin && session.shopRole !== 'owner') return new NextResponse('Shop owner access required.',{status:403});
     if (tenant.kind === 'admin' && !session.isPlatformAdmin) return new NextResponse('Platform admin access required.',{status:403});
     if (tenant.kind === 'shop' && !session.shopRole && !session.isPlatformAdmin) return new NextResponse('Shop membership required.',{status:403});
   }
   // Phase 2 exposes the tenant/auth foundation. Unported handlers must never fall back to SQLite.
   const supported = ['/api/customer-qr','/api/devices','/api/printers/test','/api/staff/members','/api/invitations','/api/launch','/api/fulfilment','/api/agent/jobs','/api/create-order','/api/verify-payment','/api/razorpay-webhook','/api/checkout','/api/upload','/api/config','/api/admin/shops','/api/auth/login','/api/auth/logout','/api/auth/session'].includes(pathname) || /^\/api\/staff\/(members|invitations)\/[0-9a-f-]{36}$/.test(pathname) || (pathname.startsWith('/api/file/') && request.method === 'GET') || (pathname === '/api/orders' && ['GET','PUT'].includes(request.method));
   if (api && !supported) return NextResponse.json({error:'This operation is not enabled in multi-shop mode yet.'},{status:501});
   const response = NextResponse.next({request:{headers}});
   response.headers.set('Cache-Control','no-store');
   return response;
 } catch {
   return NextResponse.json({error:'Service temporarily unavailable.'},{status:503});
 }
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|vendor/|downloads/).*)'] };
