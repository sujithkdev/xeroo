const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const crypto = require('crypto');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText, filename);
const { unlockDocumentBytes } = require('../src/lib/pdfUnlock.ts');
const port = 3187;
const base = 'http://127.0.0.1:' + port;
const agentToken = crypto.randomBytes(32).toString('hex');
const dataDir = path.resolve('.test-data', crypto.randomUUID());
let server; let output = ''; let count = 0;
const check = (condition, message) => { assert.ok(condition, message); count++; console.log('PASS', message); };
async function start() {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: path.resolve('.'), windowsHide: true, env: { ...process.env, DATA_DIR: dataDir, AGENT_TOKEN: agentToken, LOCAL_OPERATOR_MODE: 'true', IMPORT_LEGACY_DB: 'false', WHATSAPP_APP_SECRET: '', NODE_ENV: 'production' }, stdio: ['ignore','pipe','pipe']
  });
  server.stdout.on('data', d => output += d); server.stderr.on('data', d => output += d);
  for (let i=0;i<100;i++) { if(server.exitCode!==null)throw new Error(output); try { if((await fetch(base+'/api/config')).ok)return; } catch {} await new Promise(r=>setTimeout(r,250)); }
  throw new Error('Server did not start: '+output);
}
async function stop() { if(server && server.exitCode===null){const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;} }
async function call(url, method='GET', body, headers={}) {
 const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,body:await res.json()};
}
async function upload(bytes,name='test.pdf') {
 const form=new FormData();form.append('file',new Blob([bytes],{type:'application/pdf'}),name);
 const res=await fetch(base+'/api/upload',{method:'POST',body:form});return {status:res.status,body:await res.json()};
}
async function main() {
 await start();
 for(const route of ['/','/upload','/track','/shop','/shop/inbox','/shop/orders','/shop/printers','/shop/settings','/tools','/tools/merge-pdf','/tools/protect-pdf']) {
  const res=await fetch(base+route); check(res.ok,'page renders '+route);
 }
 const billing=await (await fetch(base+'/admin/subscriptions')).text();check(billing.includes('Billing is not connected')&&!billing.includes('Record payment'),'billing screen does not offer fake payment recording');
 check((await call('/api/config')).body.capabilities.refunds===true,'local workspace exposes refund capability');
 const login=await fetch(base+'/shop/login',{redirect:'manual'});check([307,308].includes(login.status),'login screen redirects to console');
 const remote={Host:'example.com','x-forwarded-for':'203.0.113.10'};
 check((await call('/api/orders','GET',undefined,remote)).status===401,'remote callers cannot list all orders');
 check((await call('/api/customers','GET',undefined,remote)).status===401,'remote callers cannot list customers');
 check((await call('/api/config','POST',{autoPrintEnabled:false},remote)).status===401,'remote callers cannot change settings');
 check((await call('/api/config','POST',{autoPrintEnabled:false},{Origin:'https://evil.example'})).status===401,'cross-origin writes rejected');
 check((await call('/api/razorpay-webhook','POST',{event:'payment.captured'})).status===401,'unsigned payment webhook rejected');
 check((await fetch(base+'/api/webhook/whatsapp',{method:'POST',body:'{}'})).status===401,'unsigned WhatsApp webhook rejected');
 const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();pdf.addPage();const bytes=await pdf.save();
 const uploaded=await upload(bytes);check(uploaded.status===200&&uploaded.body.pages===3,'server counts actual PDF pages');
 check((await upload(Buffer.from('not a PDF'))).status===400,'invalid PDF rejected');
 check((await upload(bytes,'fake.docx')).status===400,'unsupported file rejected');
 const encrypted=await PDFDocument.create();encrypted.addPage();encrypted.encrypt({userPassword:'test-password',ownerPassword:'owner-password'});const locked=await encrypted.save();
 await assert.rejects(()=>PDFDocument.load(locked,{password:'wrong'}));check(true,'wrong PDF password rejected');
 const plain=await unlockDocumentBytes(locked,'test-password');check((await PDFDocument.load(plain)).getPageCount()===1,'PDF encrypt/decrypt round trip preserves pages');
 check((await upload(locked)).status===400,'encrypted uploads require unlocking first');
 const payload={customerName:'Integration test',customerPhone:'9876543210',fileUrl:uploaded.body.fileUrl,pages:1,fileSize:0.001,copies:2,paperSize:'A4',colorMode:'bw',duplex:'simplex',orientation:'portrait',paymentMethod:'cash',id:'overwrite-attempt'};
 const retryPayload={...payload,checkoutKey:crypto.randomUUID(),customerInstructions:'Keep pages in order'};
 const firstAttempts=await Promise.all(Array.from({length:4},()=>call('/api/orders','POST',retryPayload)));
 const created=firstAttempts[0];
 check(firstAttempts.every(r=>r.status===200&&r.body.order.id===created.body.order.id),'simultaneous first checkout submissions create one order');check(created.status===200,'cash order accepted');const order=created.body.order;
 const retries=await Promise.all(Array.from({length:6},()=>call('/api/orders','POST',retryPayload)));
 check(retries.every(r=>r.body.order.id===order.id),'checkout retries reuse the original order');
 check((await call('/api/orders','POST',{...retryPayload,copies:3})).status===400,'checkout key cannot change order settings');
 const tracking=(await call('/api/orders?token='+order.trackingToken,'GET',undefined,remote)).body.orders[0];
 check(tracking.id===order.id&&!tracking.fileUrl&&!tracking.customerPhone&&!tracking.pickupCode&&!tracking.checkoutKey,'private tracking returns limited order data');
 check((await call('/api/orders?token=invalid','GET',undefined,remote)).body.orders.length===0,'invalid tracking token reveals no orders');
 check(order.customerInstructions==='Keep pages in order','customer instructions are saved');
 check(order.pages===3&&order.amount===12,'price uses stored document, not forged request page count');
 check((await call('/api/orders','POST',{...payload,pageRange:'1-2'})).status===400,'unsupported page-range printing rejected');
 check((await call('/api/orders','POST',{...payload,finishing:'spiral'})).status===400,'unsupported finishing rejected');
 check((await call('/api/orders','POST',{...payload,docs:[{},{}]})).status===400,'multi-document payload rejected instead of losing files');
 check((await call('/api/orders?id='+order.id,'GET',undefined,{'x-forwarded-for':'203.0.113.1'})).status===401,'order ID alone cannot disclose customer tracking');
 check(order.id!=='overwrite-attempt','order ID generated on server');
 check((await call('/api/orders','POST',{...payload,copies:-5})).status===400,'negative copies rejected');
 check((await call('/api/orders','POST',{...payload,fileUrl:'http://127.0.0.1/private'})).status===400,'arbitrary document URLs rejected');
 check((await call('/api/orders','POST',{...payload,paymentMethod:'online'})).status===400,'unconfigured online checkout fails instead of simulating payment');
 const currentRules=(await call('/api/config')).body.printRules;
 await call('/api/config','POST',{printRules:{...currentRules,acceptingOrders:false}});
 check((await call('/api/orders','POST',payload)).status===400,'paused shop rejects new orders');
 check((await call('/api/orders','POST',retryPayload)).body.order.id===order.id,'existing checkout remains recoverable while shop is paused');
 await call('/api/config','POST',{printRules:currentRules});
 const agent={Authorization:'Bearer '+agentToken};
 check((await call('/api/agent/jobs','POST',{id:order.id},agent)).status===409,'unpaid job cannot be claimed');
 check((await call('/api/orders','PUT',{id:order.id,status:'queued'},remote)).status===401,'remote order-state mutation rejected');
 check((await call('/api/orders','PUT',{id:order.id,status:'queued'})).body.order.isPaid===true,'operator cash collection queues paid job');
 const claims=await Promise.all([call('/api/agent/jobs','POST',{id:order.id,agentId:'a'},agent),call('/api/agent/jobs','POST',{id:order.id,agentId:'b'},agent)]);
 check(claims.filter(r=>r.status===200).length===1,'exactly one simultaneous agent can claim a job');
 const claimed=claims.find(r=>r.status===200).body.order;
 check((await call('/api/agent/jobs','PUT',{id:order.id,status:'printing',claimToken:'wrong'},agent)).status===409,'wrong job lease rejected');
 for(const status of ['printing','submitted'])check((await call('/api/agent/jobs','PUT',{id:order.id,status,claimToken:claimed.claimToken},agent)).status===200,'agent transition '+status);
 check((await call('/api/fulfilment','POST',{id:order.id,action:'ready',inspectionConfirmed:true,finishingConfirmed:true},remote)).status===401,'remote caller cannot fulfil an order');
 check((await call('/api/orders','PUT',{id:order.id,status:'ready'})).status===409,'ready rejects missing inspection confirmation');
 check((await call('/api/orders','PUT',{id:order.id,status:'ready',inspectionConfirmed:true,finishingConfirmed:true})).status===200,'operator confirms output ready for pickup');
 check((await call('/api/fulfilment','POST',{id:order.id,action:'notify',channel:'phone',result:'failed',note:'No answer'})).body.order.readyNotification.status==='failed','failed notification stays visible');
 check((await call('/api/fulfilment','POST',{id:order.id,action:'notify',channel:'phone',result:'sent',note:'Customer reached'})).body.order.readyNotification.attempts.length===2,'notification retry preserves attempt history');
 check((await call('/api/orders?token='+order.trackingToken,'GET',undefined,remote)).body.orders[0].pickupCode===order.pickupCode,'ready tracking displays pickup code');
 check((await call('/api/orders','PUT',{id:order.id,status:'collected',pickupCode:'wrong'})).status===409,'wrong collection code rejected');
 check((await call('/api/orders','PUT',{id:order.id,status:'collected',pickupCode:order.pickupCode})).body.order.collectionStatus==='collected','verified collection recorded separately');
 check((await call('/api/orders','PUT',{id:order.id,staffNotes:'Collected by customer'})).body.order.staffNotes==='Collected by customer','staff notes persist');
 check((await call('/api/orders?token='+order.trackingToken,'GET',undefined,remote)).body.orders[0].staffNotes===undefined,'staff notes are private');
 check((await fetch(base+uploaded.body.fileUrl,{headers:remote})).status===401,'private document denied remotely');
 check((await fetch(base+uploaded.body.fileUrl,{headers:{...remote,...agent}})).ok,'authorized agent can download document');
 const parallel=await Promise.all(Array.from({length:12},()=>call('/api/orders','POST',payload)));
 check(parallel.every(r=>r.status===200),'concurrent order creation succeeds');
 const all=await call('/api/orders');check(all.body.orders.length===13,'concurrent writes preserve every order');
 check((await call('/api/refund','POST',{id:order.id,reason:'Customer requested refund'})).status===409,'cash refund requires explicit cash-return confirmation');
 const {refundRequest}=require('../src/lib/refunds.ts');
 const refundBody=refundRequest({...order,isPaid:true,paymentId:'cash-test',status:'collected',paymentMethod:'cash'},'Customer requested refund',true);
 const refunded=await call('/api/refund','POST',refundBody);check(refunded.status===200&&refunded.body.state==='processed','cash refund recorded using the payment-screen request contract');
 check((await call('/api/orders')).body.orders.find(o=>o.id===order.id).refundReason==='Customer requested refund','refund reason survives database readback');
 check((await call('/api/refund','POST',{id:order.id,cashReturned:true})).status===409,'duplicate refund rejected');
 check((await call('/api/agent/jobs','POST',{id:order.id},agent)).status===409,'refunded job cannot print');
 // Exercise signed provider events without making an external payment request.
 const webhookSecret='integration-webhook-secret';
 await call('/api/config','POST',{razorpayConfig:{keyId:'rzp_test_fixture',keySecret:'fixture-secret',webhookSecret,isConfigured:true,testMode:true}});
 const online=(await call('/api/orders','POST',{...payload,paymentMethod:'online'})).body.order;
 const {DatabaseSync}=require('node:sqlite');const sql=new DatabaseSync(path.join(dataDir,'print-hub.sqlite'));sql.exec('PRAGMA busy_timeout=5000');
 const state=JSON.parse(sql.prepare('SELECT value FROM state WHERE id=1').get().value);state.orders.find(o=>o.id===online.id).razorpayOrderId='order_fixture';sql.prepare('UPDATE state SET value=? WHERE id=1').run(JSON.stringify(state));sql.close();
 const event={event:'payment.captured',payload:{payment:{entity:{id:'pay_fixture',order_id:'order_fixture',amount:1200,currency:'INR',status:'captured'}}}};
 const signed=e=>call('/api/razorpay-webhook','POST',e,{'x-razorpay-signature':crypto.createHmac('sha256',webhookSecret).update(JSON.stringify(e)).digest('hex')});
 const wrong=structuredClone(event);wrong.payload.payment.entity.amount=100;
 check((await signed(wrong)).status===400,'signed but underpaid event rejected');
 check((await signed(event)).status===200,'matching signed captured payment accepted');
 check((await signed(event)).status===200,'duplicate payment webhook is idempotent');
 const paid=(await call('/api/orders')).body.orders.find(o=>o.id===online.id);check(paid.isPaid&&paid.paymentId==='pay_fixture','verified payment ID and paid state persisted together');
 await call('/api/orders','PUT',{id:online.id,status:'cancelled'});
 check((await signed(event)).status===200&&(await call('/api/orders')).body.orders.find(o=>o.id===online.id).status==='cancelled','payment replay cannot requeue a cancelled order');
 const publicConfig=(await call('/api/config','GET',undefined,remote)).body;
 check(!publicConfig.razorpayConfig.keySecret&&!publicConfig.razorpayConfig.webhookSecret&&!publicConfig.whatsappConfig,'public config contains no provider secrets');
 await stop();await start();check((await call('/api/orders')).body.orders.length===14,'orders persist after server restart');
 console.log('Integration checks passed:',count);
}
main().catch(error=>{console.error(error);console.error(output.slice(-6000));process.exitCode=1;}).finally(stop);

