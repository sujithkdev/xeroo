import {NextResponse} from 'next/server';
import QRCode from 'qrcode';
import {isLocalMode} from '@/lib/access';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requireStaff,AuthError} from '@/lib/auth/permissions';
export async function GET(request:Request){try{
 if(isLocalMode())return NextResponse.json({error:'A hosted shop address is required for phone access.'},{status:409});
 requireStaff(await getSessionWithShop(request));
 const domain=process.env.APP_DOMAIN!;
 const host=request.headers.get('host')!;
 const url=`${domain.endsWith('.localhost')?'http':'https'}://${host}/upload`;
 return new Response(await QRCode.toString(url,{type:'svg',margin:2,width:240}),{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store'}});
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Unavailable'},{status:e instanceof AuthError?e.status:400});}}
