const assert = require('node:assert/strict');
const fs=require('node:fs');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { spawn } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { migrate } = require('./migrate.cjs');
const schema = 'test_phase2_' + crypto.randomBytes(8).toString('hex');
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('options', '-csearch_path=' + schema + ',public');
const connectionString = url.toString();
const root = new Client({ connectionString: process.env.DATABASE_URL });
const sql = new Client({ connectionString });
const port = 3188; const base = 'http://127.0.0.1:' + port;
let server, output = '', count = 0;
const check = (ok, message) => { assert.ok(ok, message); count++; console.log('PASS', message); };
async function call(host, path, method = 'GET', body, cookie, extra = {}) {
  return new Promise((resolve,reject)=>{
    const req=require('node:http').request(base+path,{method,agent:false,headers:{Host:host,'Content-Type':'application/json',...(body===undefined?{}:{'Content-Length':Buffer.byteLength(Buffer.isBuffer(body)?body:JSON.stringify(body))}),...(cookie?{Cookie:cookie}:{}),...extra}},res=>{
      let text='';res.on('data',d=>text+=d);res.on('end',()=>{
        let data;try{data=JSON.parse(text);}catch{data={message:text.slice(0,200)};}
        const headers=new Headers();for(const [k,v] of Object.entries(res.headers))if(v)headers.set(k,Array.isArray(v)?v.join(', '):v);
        resolve({status:res.statusCode,data,cookie:res.headers['set-cookie']?.[0]?.split(';')[0],headers});
      });
    });req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('Request timeout')));if(body!==undefined)req.write(Buffer.isBuffer(body)?body:JSON.stringify(body));req.end();
  });
}
async function main() {
 await root.connect(); await root.query(`CREATE SCHEMA ${schema}`); await sql.connect();
 await migrate(connectionString); await migrate(connectionString);
 check((await sql.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n===require('fs').readdirSync('migrations').filter(f=>/^\d+.*\.sql$/.test(f)).length,'versioned migrations apply once');
 const ids = { a:crypto.randomUUID(),b:crypto.randomUUID(),owner:crypto.randomUUID(),staff:crypto.randomUUID(),admin:crypto.randomUUID(),oa:crypto.randomUUID(),ob:crypto.randomUUID(),doc:crypto.randomUUID() };
 const password=crypto.randomBytes(18).toString('hex'), hash=await bcrypt.hash(password,12);
 for(const [key,slug] of [['a','alpha'],['b','beta']]) {
   await sql.query("INSERT INTO shops(id,name,subdomain,status) VALUES($1,$2,$3,'active')",[ids[key],slug,slug]);
   await sql.query('INSERT INTO shop_settings(shop_id) VALUES($1)',[ids[key]]);
   await sql.query('INSERT INTO print_rules(shop_id) VALUES($1)',[ids[key]]);
   await sql.query("INSERT INTO service_prices(shop_id,key,paise) VALUES($1,'A4_BW',$2)",[ids[key],key==='a'?200:500]);
 }
 for(const role of ['owner','staff','admin'])await sql.query('INSERT INTO users(id,email,name,password_hash,is_platform_admin) VALUES($1,$2,$3,$4,$5)',[ids[role],role+'@example.test',role,hash,role==='admin']);
 await sql.query("INSERT INTO shop_memberships(shop_id,user_id,role,joined_at) VALUES($1,$2,'owner',now()),($3,$2,'owner',now()),($1,$4,'staff',now())",[ids.a,ids.owner,ids.b,ids.staff]);
 for(const [key,order] of [['a','oa'],['b','ob']]) await sql.query("INSERT INTO orders(id,shop_id,tracking_token,pickup_code,customer_name,customer_phone,source,payment_method,amount_paise) VALUES($1,$2,$3,'123456','Private Customer','9876543210','web','cash',200)",[ids[order],ids[key],crypto.createHash('sha256').update(order).digest('hex')]);
 await sql.query("INSERT INTO documents(id,shop_id,storage_key,file_name,pages,size_bytes,checksum) VALUES($1,$2,'beta/file','file.pdf',1,100,'checksum')",[ids.doc,ids.b]);
 await assert.rejects(()=>sql.query("INSERT INTO order_items(order_id,shop_id,document_id,file_name,pages,copies,color_mode,paper_size,duplex,finishing,item_paise) VALUES($1,$2,$3,'file.pdf',1,1,'bw','A4','simplex','none',200)",[ids.oa,ids.a,ids.doc]),e=>e.code==='23503');check(true,'database rejects cross-shop document references');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,env:{...process.env,DATABASE_URL:connectionString,APP_DOMAIN:'print.localhost',LOCAL_DB_MODE:'false',LOCAL_OPERATOR_MODE:'false',NODE_ENV:'production'},stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
 let lastProbe;
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Test server exited.');try{lastProbe=await call('alpha.print.localhost','/api/config');if(lastProbe.status===200)break;}catch{}if(i===99)throw Error('Test server startup timed out: '+JSON.stringify(lastProbe && {status:lastProbe.status,data:lastProbe.data}));await new Promise(r=>setTimeout(r,250));}
 check((await call('alpha.print.localhost','/api/config')).data.pricingConfig.A4_BW===2,'alpha receives its own prices');
 check((await call('beta.print.localhost','/api/config')).data.pricingConfig.A4_BW===5,'beta receives its own prices');
 check((await call('unknown.print.localhost','/api/config')).status===404,'unknown shop fails closed');
 check((await call('alpha.print.localhost.evil.test','/api/config')).status===404,'lookalike domain rejected');
 check((await call('alpha.print.localhost','/api/orders')).status===401,'anonymous staff orders denied');
 check((await call('alpha.print.localhost','/shop')).status===307,'protected shop page requires a session');
 check((await call('admin.print.localhost','/api/admin/shops')).status===401,'admin API requires authentication');
 const login=(role,host='alpha.print.localhost')=>call(host,'/api/auth/login','POST',{email:role+'@example.test',password});
 const owner=await login('owner'), staff=await login('staff'), admin=await login('admin','admin.print.localhost');
 check(owner.status===200&&staff.status===200&&admin.status===200,'owner staff and admin sign in');
 for(const route of ['/shop/daily-report','/shop/settings']){
   check((await call('alpha.print.localhost',route,'GET',undefined,staff.cookie)).status===403,'staff cannot open '+route);
   check((await call('alpha.print.localhost',route,'GET',undefined,owner.cookie)).status===200,'owner can open '+route);
 }
 check((await call('alpha.print.localhost','/shop/queue','GET',undefined,staff.cookie)).status===200,'staff can open the print queue');
 check(owner.headers.get('set-cookie').includes('HttpOnly')&&owner.headers.get('set-cookie').includes('Secure')&&!owner.headers.get('set-cookie').includes('Domain='),'sessions use secure host-only cookies');
 check((await call('alpha.print.localhost','/api/orders','GET',undefined,owner.cookie)).data.orders[0].id===ids.oa,'owner reads only current shop orders');
 check((await call('beta.print.localhost','/api/orders','GET',undefined,owner.cookie)).status===401,'session cannot move to another shop even with membership');
 check((await call('alpha.print.localhost','/api/orders','GET',undefined,owner.cookie,{'x-shop-id':ids.b})).data.orders[0].id===ids.oa,'client tenant headers cannot override hostname');
 const token=crypto.createHash('sha256').update('oa').digest('hex');
 const tracked=await call('alpha.print.localhost','/api/orders?token='+token);
 check(tracked.status===200&&tracked.data.orders.length===1&&!tracked.data.orders[0].customerPhone,'tracking response omits private customer data');
 check((await call('beta.print.localhost','/api/orders?token='+token)).data.orders.length===0,'tracking token is scoped to the shop');
 check((await call('alpha.print.localhost','/api/config','POST',{pricingConfig:{A4_BW:3}},staff.cookie)).status===403,'staff cannot change prices');
 check((await call('alpha.print.localhost','/api/config','POST',{pricingConfig:{A4_BW:3}},owner.cookie)).status===200,'owner can change own shop prices');
 check((await call('beta.print.localhost','/api/config')).data.pricingConfig.A4_BW===5,'price update does not change another shop');
 check((await call('alpha.print.localhost','/api/config','POST',{autoPrintEnabled:false},owner.cookie,{Origin:'https://evil.test'})).status===401,'cross-origin writes rejected');
 check((await call('admin.print.localhost','/api/admin/shops','GET',undefined,owner.cookie)).status===401,'shop session cannot access admin host');
 check((await call('admin.print.localhost','/api/admin/shops','GET',undefined,admin.cookie)).data.shops.length===2,'platform admin sees both shops');
 check((await call('alpha.print.localhost','/api/refund','POST',{})).status===501,'unported handler cannot fall back to SQLite');

 const pdf=await require('pdf-lib').PDFDocument.create();pdf.addPage([100,200]);pdf.addPage([300,400]);
 const boundary='test'+crypto.randomBytes(12).toString('hex');
 const multipart=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="checkout.pdf"\r\nContent-Type: application/pdf\r\n\r\n'),Buffer.from(await pdf.save()),Buffer.from('\r\n--'+boundary+'--\r\n')]);
 const upload=await call('alpha.print.localhost','/api/upload','POST',multipart,undefined,{'Content-Type':'multipart/form-data; boundary='+boundary,'Content-Length':String(multipart.length)});
 check(upload.status===200,'tenant PDF upload succeeds');
 const checkout=(body,cookie)=>call('alpha.print.localhost','/api/checkout','POST',body,cookie);
 const quoted=await checkout({action:'quote',docs:[{fileUrl:upload.data.fileUrl,copies:2,paperSize:'A4',colorMode:'bw',duplex:'duplex',pageRange:'2',finishing:'none'}]});
 check(quoted.status===200&&quoted.data.data.amountPaise===1200,'tenant duplex quote uses two copies of one selected sheet at the fallback sheet price');
 const q=quoted.data.data;
 check((await call('beta.print.localhost','/api/checkout','POST',{action:'slots',quoteId:q.id})).status===409,'quote cannot cross tenant boundary');
 const slots=await checkout({action:'slots',quoteId:q.id});const pickup=slots.data.data.slots[0];
 check((await checkout({action:'reserve',quoteId:q.id,requestedAt:pickup})).status===200,'tenant pickup reservation persists');
 const placed=await checkout({action:'place',quoteId:q.id,customerPhone:'9876543210',paymentMethod:'cash',source:'counter'},owner.cookie);
 check(placed.status===200,'authenticated walk-in checkout succeeds');const order=placed.data.data;
 check((await sql.query('SELECT count(*)::int n FROM order_items WHERE order_id=$1',[order.id])).rows[0].n===1,'checkout persists normalized print items');
 check((await checkout({action:'confirmPickup',trackingToken:order.trackingToken,confirmedAt:pickup})).status===401,'customer cannot confirm shop commitment');
 check((await call('alpha.print.localhost','/api/orders','PUT',{id:order.id,status:'queued'},owner.cookie)).status===200,'staff records cash payment');
 const confirmed=await checkout({action:'confirmPickup',trackingToken:order.trackingToken,confirmedAt:pickup},owner.cookie);
 check(confirmed.status===200&&confirmed.data.data.status==='queued'&&confirmed.data.data.confirmedPickupAt===pickup,'paid tenant order queues only after pickup confirmation');

 const webQuote=await checkout({action:'quote',docs:[{fileUrl:upload.data.fileUrl,copies:1,paperSize:'A4',colorMode:'bw',duplex:'simplex',finishing:'none'}]});
 const webQuoteId=webQuote.data.data.id;
 const webSlots=await checkout({action:'slots',quoteId:webQuoteId});
 await checkout({action:'reserve',quoteId:webQuoteId,requestedAt:webSlots.data.data.slots[0]});
 const webOrder=await checkout({action:'place',quoteId:webQuoteId,customerPhone:'9876543210',paymentMethod:'cash',source:'web'});
 check(webOrder.status===200&&!webOrder.data.data.isPaid,'guest website checkout creates unpaid order');
 const inbox=await call('alpha.print.localhost','/api/orders','GET',undefined,staff.cookie);
 check(inbox.data.orders.some(o=>o.id===webOrder.data.data.id&&o.source==='web'),'shop staff sees the guest order in its inbox');
 const agentToken=crypto.randomBytes(32).toString('hex'),agentId=crypto.randomUUID();
 await sql.query('INSERT INTO agents(id,shop_id,token_hash) VALUES($1,$2,$3)',[agentId,ids.a,crypto.createHash('sha256').update(agentToken).digest('hex')]);
 const agentHeaders={Authorization:'Bearer '+agentToken};
 const claim=await call('alpha.print.localhost','/api/agent/jobs','POST',{id:order.id,capabilities:['multi-document-v1']},undefined,agentHeaders);
 check(claim.status===200,'tenant agent claims eligible job');const lease=claim.data.order.claimToken;
 check((await call('beta.print.localhost','/api/agent/jobs','PUT',{id:order.id,claimToken:lease,status:'printing'},undefined,agentHeaders)).status===401,'agent cannot report progress on another shop');
 check((await call('alpha.print.localhost','/api/agent/jobs','PUT',{id:order.id,claimToken:lease,status:'printing'},undefined,agentHeaders)).status===200,'tenant agent records print submission boundary');
 check((await call('alpha.print.localhost','/api/agent/jobs','PUT',{id:order.id,claimToken:lease,status:'error',outcome:'uncertain',reason:'Simulated driver disconnect',completedDocuments:0},undefined,agentHeaders)).status===200,'tenant print failure retains uncertain outcome');
 const fulfil=(body,cookie=owner.cookie)=>call('alpha.print.localhost','/api/fulfilment','POST',{id:order.id,...body},cookie);
 check((await fulfil({action:'recover',resolution:'retry_selected',documentIds:[order.documents[0].id]})).status===409,'tenant recovery requires physical inspection and stopped agent');
 const recovered=await fulfil({action:'recover',resolution:'output_complete',agentStopped:true,outputInspected:true,reason:'Test operator inspected all pages and cleared the spool queue.'});
 check(recovered.status===200&&recovered.data.order.status==='submitted'&&recovered.data.order.isPaid,'tenant recovery preserves payment and accepts inspected output');
 check((await call('alpha.print.localhost','/api/agent/jobs','PUT',{id:order.id,claimToken:lease,status:'submitted'},undefined,agentHeaders)).status===409,'revoked agent claim cannot overwrite staff recovery');
 check((await fulfil({action:'ready'})).status===409,'tenant ready requires finishing and quality checks');
 check((await fulfil({action:'ready',inspectionConfirmed:true,finishingConfirmed:true})).data.order.readyNotification.status==='pending','tenant ready persists notification task');
 check((await fulfil({action:'notify',channel:'phone',result:'failed',note:'Test no answer'})).data.order.readyNotification.status==='failed','tenant notification failure persists');
 check((await fulfil({action:'notify',channel:'phone',result:'sent',note:'Test customer reached'})).data.order.readyNotification.attempts.length===2,'tenant notification retry keeps history');
 check((await fulfil({action:'collect',pickupCode:'wrong'})).status===409,'tenant handover rejects incorrect code');
 check((await fulfil({action:'collect',pickupCode:order.pickupCode})).data.order.status==='collected','tenant correct code completes handover');
 const stored=(await sql.query('SELECT checkout_payload FROM orders WHERE id=$1',[order.id])).rows[0].checkout_payload;
 check(stored.fulfilmentEvents.some(e=>e.action==='handed_over')&&stored.collectedAt,'tenant fulfilment audit survives database readback');

 check((await call('alpha.print.localhost','/api/launch')).status===401,'launch metrics require staff authentication');
 check((await call('alpha.print.localhost','/api/launch','POST',{action:'enable'},staff.cookie)).status===403,'ordinary staff cannot activate rollout controls');
 check((await call('alpha.print.localhost','/api/launch','POST',{action:'enable'},owner.cookie)).status===200,'owner enables staged rollout for own shop');
 check((await call('alpha.print.localhost','/api/launch','POST',{action:'advance'},owner.cookie)).status===409,'rollout advancement requires evidence');
 const launch=await call('alpha.print.localhost','/api/launch','GET',undefined,owner.cookie);
 check(launch.data.launch.enabled&&launch.data.metrics.total>=1&&launch.data.metrics.failures===1,'launch metrics include recovered tenant print failure');
 check(!(await sql.query('SELECT launch FROM checkout_state WHERE shop_id=$1',[ids.b])).rows[0]?.launch?.enabled,'enabling one shop leaves other shop rollout untouched');

 const setup={name:'Pilot Test Shop',subdomain:'pilot-test',ownerEmail:'pilot-owner@example.test',a4Price:2.5,tagline:'Campus printing'};
 check((await call('admin.print.localhost','/api/admin/shops','POST',setup)).status===401,'anonymous shop creation denied');
 check((await call('alpha.print.localhost','/api/admin/shops','POST',setup,owner.cookie)).status===404,'shop owner cannot create platform shops');
 check((await call('admin.print.localhost','/api/admin/shops','POST',{...setup,subdomain:'admin'},admin.cookie)).status===409,'reserved subdomain rejected');
 const created=await call('admin.print.localhost','/api/admin/shops','POST',setup,admin.cookie);
 check(created.status===200&&created.data.delivery==='manual','admin creates shop and accurately reports manual invitation delivery');
 const invalid=await call('admin.print.localhost','/api/admin/shops','POST',{...setup,subdomain:'invalid-price',a4Price:0},admin.cookie);
 check(invalid.status===409&&(await sql.query("SELECT id FROM shops WHERE subdomain='invalid-price'")).rowCount===0,'invalid pricing creates no partial shop');
 const inviteToken=new URL(created.data.invitationUrl).pathname.split('/').pop();
 check((await call('admin.print.localhost','/api/admin/shops','POST',setup,admin.cookie)).status===409,'duplicate subdomain rejected');
 const seeded=(await sql.query('SELECT accepting_orders,auto_print_enabled,tagline FROM shop_settings WHERE shop_id=$1',[created.data.shop.id])).rows[0];
 check(!seeded.accepting_orders&&!seeded.auto_print_enabled&&seeded.tagline==='Campus printing','new shop is branded and paused for setup');
 check((await call('pilot-test.print.localhost','/api/config')).data.pricingConfig.A4_BW===2.5,'initial service price is persisted');
 check((await call('alpha.print.localhost','/api/invitations?token='+inviteToken)).status===400,'invitation cannot cross shop boundary');
 check((await call('pilot-test.print.localhost','/api/invitations?token='+inviteToken)).data.role==='owner','invitation exposes real fixed owner role');
 await sql.query("UPDATE invitations SET expires_at=now()-interval '1 minute' WHERE shop_id=$1",[created.data.shop.id]);
 check((await call('pilot-test.print.localhost','/api/invitations?token='+inviteToken)).status===400,'expired invitation is rejected');
 await sql.query("UPDATE invitations SET expires_at=now()+interval '48 hours' WHERE shop_id=$1",[created.data.shop.id]);

 const acceptBody={token:inviteToken,name:'Pilot Owner',password};
 const accepted=await Promise.all([call('pilot-test.print.localhost','/api/invitations','POST',acceptBody),call('pilot-test.print.localhost','/api/invitations','POST',acceptBody)]);
 check(accepted.filter(r=>r.status===200).length===1,'concurrent invitation acceptance creates exactly one owner');
 check((await call('pilot-test.print.localhost','/api/invitations?token='+inviteToken)).status===400,'used invitation cannot be reused');
 check((await call('pilot-test.print.localhost','/api/auth/login','POST',{email:setup.ownerEmail,password})).status===200,'invited owner can sign in to new shop');
 check((await call('alpha.print.localhost','/api/auth/login','POST',{email:setup.ownerEmail,password})).status===401,'new owner cannot sign in to another shop');

 // Hosted desktop pilot: credentials, tenant isolation, printer setup and real admin controls.
 const pilotHost='pilot-test.print.localhost';
 const pilot=await call(pilotHost,'/api/auth/login','POST',{email:setup.ownerEmail,password});
 check((await call(pilotHost,'/api/staff/members','GET',undefined,pilot.cookie)).status===200,'staff management route is enabled for owner');
 check((await call(pilotHost,'/api/devices','POST',{label:'Test PC'})).status===401,'anonymous computer registration denied');
 const paired=await call(pilotHost,'/api/devices','POST',{label:'Test PC'},pilot.cookie);
 check(paired.status===201&&paired.data.token.length===64,'owner registers a printing computer');
 check((await call(pilotHost,'/api/devices','POST',{label:'Second PC'},pilot.cookie)).status===409,'second printing computer rejected');
 const bearer={Authorization:'Bearer '+paired.data.token};
 const inventory={printers:[{Name:'Physical Test Printer',DriverName:'Test driver',WorkOffline:false},{Name:'Microsoft Print to PDF',WorkOffline:false}],pcName:'Test PC',agentVersion:'test'};
 check((await call(pilotHost,'/api/config','POST',inventory,undefined,bearer)).status===200,'registered computer reports Windows inventory');
 check((await call('alpha.print.localhost','/api/config','POST',inventory,undefined,bearer)).status===403,'computer cannot report inventory to another shop');
 const config=(await call(pilotHost,'/api/config','GET',undefined,pilot.cookie)).data;
 check(config.printers.length===1&&config.printers[0].status==='idle'&&config.lastAgentPing,'physical printer discovered and virtual printer excluded');
 const configured={...config.printers[0],isDefaultBW:true};
 check((await call(pilotHost,'/api/config','POST',{printers:[configured]},pilot.cookie)).status===200,'owner saves detected printer capabilities');
 check((await call('alpha.print.localhost','/api/config','POST',{printers:[configured]},owner.cookie)).status!==200,'printer capability edit cannot cross shop boundary');
 check((await call(pilotHost,'/api/printers/test','POST',{printerId:configured.id},pilot.cookie)).status===400,'test page requires enabled print queue');
 await call(pilotHost,'/api/config','POST',{autoPrintEnabled:true},pilot.cookie);
 const printTest=await call(pilotHost,'/api/printers/test','POST',{printerId:configured.id},pilot.cookie);
 check(printTest.status===200,'hosted printer test creates a real PDF and queued test order: '+JSON.stringify(printTest.data));
 const testOrder=(await call(pilotHost,'/api/orders','GET',undefined,undefined,bearer)).data.orders.find(o=>o.id===printTest.data.id);
 check(testOrder?.assignedPrinterId===configured.id&&testOrder.synthetic&&testOrder.documents.length===1,'test retains selected printer and is excluded from business metrics');
 check((await call(pilotHost,'/api/customer-qr','GET',undefined,pilot.cookie)).status===200,'customer QR code generated for signed-in shop');
 check((await call(pilotHost,'/api/customer-qr')).status===401,'anonymous QR management endpoint denied');
 check((await call('admin.print.localhost','/api/tls-approved?domain=pilot-test.print.localhost')).status===204,'TLS issuance permitted for registered shop');
 check((await call('admin.print.localhost','/api/tls-approved?domain=attacker.example')).status===403,'TLS issuance denied for unrelated domain');
 const staffInvite=await call(pilotHost,'/api/staff/members','POST',{email:'staff@example.test',role:'staff'},pilot.cookie);
 check(staffInvite.status===200,'owner creates real staff invitation');
 const staffToken=new URL(staffInvite.data.invitationUrl).pathname.split('/').pop();
 check((await call(pilotHost,'/api/invitations','POST',{token:staffToken,password:''})).status===409,'existing staff account requires password to accept invitation');
 check((await call(pilotHost,'/api/invitations','POST',{token:staffToken,password})).status===200,'existing staff accepts invitation with valid password');

 if(process.env.TEST_ELECTRON==='true'){
  const path=require('node:path'),dir=path.resolve('.test-data',schema+'-desktop');fs.mkdirSync(dir,{recursive:true});
  const fixture=path.join(dir,'fixture.json'),result=path.join(dir,'result.json');
  fs.writeFileSync(fixture,JSON.stringify({origin:'http://'+pilotHost+':'+port,email:setup.ownerEmail,password,result}),{mode:0o600});
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const desktop=spawn(require('electron'),['electron/session-test.cjs',fixture],{env,windowsHide:true,stdio:'ignore'});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{desktop.kill();reject(Error('Desktop session timeout'));},30000);desktop.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Desktop session failed'));});});
  fs.unlinkSync(fixture);
  const observed=JSON.parse(fs.readFileSync(result));check(observed.login===200&&observed.devices===200&&observed.deviceCount===1&&observed.setupRendered&&observed.qrLoaded,'Electron login, setup screen, printer discovery and QR image render together');
 }
 check((await call(pilotHost,'/api/devices','DELETE',{id:paired.data.device.id},pilot.cookie)).status===200,'owner revokes printing computer');
 check((await call(pilotHost,'/api/agent/jobs','POST',{id:printTest.data.id},undefined,bearer)).status===401,'revoked computer cannot claim a job');
 const suspend=await call('admin.print.localhost','/api/admin/shops','PATCH',{id:created.data.shop.id,action:'suspend',reason:'Pilot suspension test'},admin.cookie);
 check(suspend.status===200&&(await call(pilotHost,'/api/config')).status===404,'admin suspension disables actual shop access');
 check((await call('admin.print.localhost','/api/admin/shops','PATCH',{id:created.data.shop.id,action:'reactivate',reason:'Pilot restored for testing'},admin.cookie)).status===200,'admin can reactivate shop for setup');
 const paused=(await call(pilotHost,'/api/config','GET',undefined,pilot.cookie)).data;
 check(!paused.autoPrintEnabled&&!paused.shopSettings.acceptingOrders,'reactivation keeps ordering and printing paused');
 await call('alpha.print.localhost','/api/auth/logout','POST',{},staff.cookie);
 check((await call('alpha.print.localhost','/api/auth/session','GET',undefined,staff.cookie)).status===401,'logout revokes session server-side');
 await sql.query('UPDATE users SET is_suspended=true WHERE id=$1',[ids.owner]);
 check((await call('alpha.print.localhost','/api/orders','GET',undefined,owner.cookie)).status===401,'suspension invalidates active access');
 await sql.query("UPDATE shops SET status='suspended' WHERE id=$1",[ids.b]);
 check((await call('beta.print.localhost','/api/config')).status===404,'suspended shop is unavailable');
 for(let i=0;i<10;i++)await call('alpha.print.localhost','/api/auth/login','POST',{email:'unknown@example.test',password:'wrong'});
 check((await call('alpha.print.localhost','/api/auth/login','POST',{email:'unknown@example.test',password:'wrong'})).status===429,'persistent login limit blocks repeated attempts');
 check((await call('alpha.print.localhost','/api/auth/session','GET',undefined,'__print_session=%ZZ')).status===401,'malformed cookie fails closed');
 console.log('Multi-shop integration checks passed:',count);
}
main().catch(e=>{console.error(e.message);console.error(output.slice(-2500));process.exitCode=1;}).finally(async()=>{
 if(server&&server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}
 await sql.end().catch(()=>{});
 // Only the randomly generated test schema is removed; application databases are untouched.
 if(/^test_phase2_[a-f0-9]{16}$/.test(schema))await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});
 await root.end().catch(()=>{});
});
