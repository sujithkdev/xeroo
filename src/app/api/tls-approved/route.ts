import {resolveTenantHost} from '@/lib/tenancy';
import {queryOne} from '@/lib/db/client';
export async function GET(request:Request){
 const domain=new URL(request.url).searchParams.get('domain')||'';
 const base=process.env.APP_DOMAIN||'';
 if(!process.env.DATABASE_URL||!base||!/^[a-z0-9.-]+$/.test(domain))return new Response(null,{status:403});
 const tenant=resolveTenantHost(domain,base);
 if(tenant.kind==='admin'||tenant.kind==='root')return new Response(null,{status:204});
 if(tenant.kind!=='shop')return new Response(null,{status:403});
 try{const shop=await queryOne("SELECT id FROM shops WHERE subdomain=$1 AND status IN ('active','testing','paused')",[tenant.slug]);return new Response(null,{status:shop?204:403});}
 catch{return new Response(null,{status:503});}
}
