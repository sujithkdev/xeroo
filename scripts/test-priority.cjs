'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto'),os=require('node:os');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const Module=require('node:module'),resolve=Module._resolveFilename;
Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve('src',id.slice(2)):id,...args);};
const {eligibleDocument}=require('./document-retention.cjs');
const {boundedBody,limitExpensiveRequest}=require('../src/lib/request-limits.ts');
const now=Date.now(),old=new Date(now-60*86400000).toISOString();
const meta={id:crypto.randomUUID(),createdAt:old};
const finished={status:'collected',updatedAt:old};
let count=0;function check(value,name){assert.ok(value,name);count++;console.log('PASS',name);}
async function main(){
 check(eligibleDocument(meta,[],[],30,now),'old abandoned uploads are eligible');
 check(eligibleDocument(meta,[finished],[],30,now),'old completed orders are eligible');
 for(const order of [{...finished,status:'queued'},{...finished,updatedAt:new Date(now).toISOString()},{...finished,paymentReviewRequired:true},{...finished,refundState:'pending'},{...finished,status:'cancelled',isPaid:true}])check(!eligibleDocument(meta,[order],[],30,now),'active/recent/disputed document retained');
 check(!eligibleDocument(meta,[],[{expiresAt:new Date(now+60000).toISOString(),items:[{fileUrl:'/api/file/'+meta.id}]}],30,now),'live quote protects old file');
 check(!eligibleDocument({...meta,createdAt:'invalid'},[],[],30,now),'invalid metadata fails closed');
 check(!eligibleDocument(meta,[finished,{status:'printing',updatedAt:old}],[],30,now),'shared PDF retained while any order is active');
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(4));c.enqueue(new Uint8Array(5));c.close();}});
 await assert.rejects(()=>boundedBody(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'}),8),e=>e.status===413);check(true,'chunked oversized request rejected without Content-Length');
 check((await boundedBody(new Request('http://localhost',{method:'POST',body:'1234'}),4)).length===4,'exact size boundary accepted');
 for(let i=0;i<60;i++)await limitExpensiveRequest(null,'upload');
 await assert.rejects(()=>limitExpensiveRequest(null,'upload'),e=>e.status===429);check(true,'local upload budget enforced');
 if(process.env.DATABASE_URL)await postgres();
 console.log(count+' priority checks passed.');
}
async function postgres(){
 const {Client}=require('pg');const original=process.env.DATABASE_URL;
 const admin=new Client({connectionString:original,connectionTimeoutMillis:5000});await admin.connect();
 const schema='test_priority_'+crypto.randomBytes(8).toString('hex');
 await admin.query('CREATE SCHEMA '+schema);
 const url=new URL(original);url.searchParams.set('options','-csearch_path='+schema+',public');process.env.DATABASE_URL=url.toString();
 process.env.LOCAL_DB_MODE='false';process.env.STORAGE_BUCKET='';process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'print-priority-'));
 const {query,queryOne}=require('../src/lib/db/client.ts');
 try{
  await require('./migrate.cjs').migrate(process.env.DATABASE_URL);
  const shop=crypto.randomUUID();await query("INSERT INTO shops(id,name,subdomain,status) VALUES($1,'Priority test','priority','active')",[shop]);
  const shops=require('../src/lib/db/shops.ts');
  await shops.upsertShopSettings(shop,{retention_days:14,enable_cash:true,accepting_orders:true});
  await shops.upsertPrintRules(shop,{slot_capacity:9});
  check((await shops.getShopSettings(shop)).retention_days===14&&(await shops.getPrintRules(shop)).slot_capacity===9,'initial settings/rules inserts retain supplied values');
  const sessions=require('../src/lib/auth/sessions.ts');sessions.getSessionWithShop=async()=>({shopId:shop,shopRole:'owner'});
  const route=require('../src/app/api/config/route.ts');
  const patch={slotCapacity:3,slotPageCapacity:222,slotDurationMinutes:15,minPrepMinutes:45,workingHoursStart:'09:00',workingHoursEnd:'18:00',maxDocumentsPerOrder:4,allowedFinishing:['none','spiral']};
  const response=await route.POST(new Request('http://localhost/api/config',{method:'POST',headers:{'x-shop-id':shop,'Content-Type':'application/json'},body:JSON.stringify({printRules:patch})}));
  assert.equal(response.status,200,JSON.stringify(await response.json()));
  const saved=await shops.getPrintRules(shop);
  check(saved.slot_capacity===3&&saved.slot_page_capacity===222&&saved.slot_duration_minutes===15&&saved.min_prep_minutes===45&&saved.working_hours_start==='09:00:00'&&saved.working_hours_end==='18:00:00'&&saved.max_docs_per_order===4&&saved.allowed_finishing.includes('spiral'),'API schedule and document settings survive database round trip');
  const settingsResponse=await route.POST(new Request('http://localhost/api/config',{method:'POST',headers:{'x-shop-id':shop,'Content-Type':'application/json'},body:JSON.stringify({shopSettings:{name:'Updated shop',address:'Counter address',gstNumber:'TEST-GST',enableCash:true,enableCashPayment:false,enableOnlinePayment:true}})}));
  assert.equal(settingsResponse.status,200);
  const configResponse=await route.GET(new Request('http://localhost/api/config',{headers:{'x-shop-id':shop}}));const config=await configResponse.json();
  check(config.shopSettings.name==='Updated shop'&&config.shopSettings.address==='Counter address'&&config.shopSettings.gstNumber==='TEST-GST','shop profile changes persist');
  check(config.shopSettings.enableCashPayment===false&&config.shopSettings.enableOnlinePayment===true,'payment toggles round trip using editable field names');
  check(config.capabilities.refunds===false&&config.capabilities.whatsapp===false,'multi-shop UI capabilities match supported handlers');
  await shops.upsertShopSettings(shop,{enable_cash:true});
  const {PDFDocument}=require('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();const bytes=await pdf.save();
  const documents=require('../src/lib/documents.ts');const doc=await documents.storeDocument(bytes,'test.pdf',shop,{maxMB:50,maxPages:500});
  check((await queryOne('SELECT expires_at FROM documents WHERE id=$1',[doc.id])).expires_at>Date.now(),'upload records retention deadline');
  const before=fs.readdirSync(path.join(process.env.DATA_DIR,'storage')).length;
  await assert.rejects(()=>documents.storeDocument(bytes,'orphan.pdf',crypto.randomUUID(),{maxMB:50,maxPages:500}));
  check(fs.readdirSync(path.join(process.env.DATA_DIR,'storage')).length===before,'failed metadata insert removes uploaded bytes');
  await query("INSERT INTO service_prices(shop_id,key,paise) VALUES($1,'A4_BW',200)",[shop]);
  const service=require('../src/lib/checkout-service.ts');
  const quote=await service.createQuote(shop,{docs:[{fileUrl:doc.fileUrl,copies:1,paperSize:'A4',colorMode:'bw',duplex:'simplex'}]});
  await service.reservePickup(shop,quote.id,(await service.pickupSlots(shop,quote.id)).slots[0]);
  await query("INSERT INTO blocked_phones(shop_id,phone) VALUES($1,'9876543210')",[shop]);
  await assert.rejects(()=>service.placeCheckout(shop,{quoteId:quote.id,paymentMethod:'cash',customerPhone:'9876543210'}),/valid phone/);check(true,'multi-shop blocked phone cannot place an order');
  await query('DELETE FROM blocked_phones WHERE shop_id=$1',[shop]);
  const order=await service.placeCheckout(shop,{quoteId:quote.id,paymentMethod:'cash',customerPhone:'9876543210'});
  check(!!order.id&&(await queryOne('SELECT expires_at FROM documents WHERE id=$1',[doc.id])).expires_at!==null,'placing order keeps a retention deadline');
  const results=await Promise.allSettled(Array.from({length:65},()=>limitExpensiveRequest(shop,'upload')));
  check(results.filter(x=>x.status==='fulfilled').length===60&&results.filter(x=>x.status==='rejected'&&x.reason.status===429).length===5,'shared PostgreSQL budget is atomic under concurrency');
  // Exercise actual cleanup against isolated PostgreSQL and filesystem data only.
  const stale=await documents.storeDocument(bytes,'abandoned.pdf',shop,{maxMB:50,maxPages:500});
  await query("UPDATE documents SET uploaded_at=now()-interval '60 days',expires_at=now()-interval '30 days' WHERE id=$1",[stale.id]);
  const {execFileSync}=require('node:child_process');
  const preview=execFileSync(process.execPath,['scripts/cleanup-documents.cjs'],{env:process.env,encoding:'utf8',windowsHide:true});
  check(preview.includes('Eligible '+stale.id)&&!(await queryOne('SELECT deleted_at FROM documents WHERE id=$1',[stale.id])).deleted_at,'cleanup preview leaves PDF intact');
  execFileSync(process.execPath,['scripts/cleanup-documents.cjs','--apply','--server-stopped'],{env:process.env,encoding:'utf8',windowsHide:true});
  await assert.rejects(()=>documents.getDocumentMetadata(stale.id,shop));
  check(!(await queryOne('SELECT deleted_at FROM documents WHERE id=$1',[doc.id])).deleted_at,'cleanup deletes abandoned bytes but preserves active order PDF');
 }finally{
  await globalThis.__pgPool?.end();globalThis.__pgPool=undefined;
  await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();
  // Keep isolated test files for inspection; never remove a computed recursive directory.
  console.log('Isolated PDF test directory: '+process.env.DATA_DIR);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
