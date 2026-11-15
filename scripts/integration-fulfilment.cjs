const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {execute,recover}=require('../agent/runner.cjs');
const {claimPrint,reportPrint,staffFulfilment}=require('../src/lib/fulfilment.ts');
let checks=0;function check(ok,name){assert.ok(ok,name);checks++;console.log('PASS',name);}
const order=()=>({id:'test',isPaid:true,status:'queued',documents:[{id:'a'},{id:'b'}],pickupCode:'AB12',amountPaise:1200});
async function scenario(fault){
 const o=order(),journal={};let submissions=0,failAck=fault==='lost-ack';claimPrint(o,'agent',['multi-document-v1']);
 const io={save:e=>{journal[e.id]=JSON.parse(JSON.stringify(e));},prepare:async()=>{if(fault==='download'||fault==='disconnect')throw Error(fault);return ['a','b'];},submit:async()=>{submissions++;if(fault==='partial'&&submissions===2)throw Error('printer disconnected during submission');},report:async(j,status,d)=>{if(status==='submitted'&&failAck){failAck=false;reportPrint(o,'agent',{...d,status,claimToken:j.claimToken});throw Error('acknowledgement lost');}return reportPrint(o,'agent',{...d,status,claimToken:j.claimToken});}};
 await execute(o,io);return {o,journal,io,count:()=>submissions};
}
async function main(){
 for(const fault of ['download','disconnect']){const x=await scenario(fault);check(x.count()===0&&x.o.status==='error'&&x.o.printOutcome==='not_submitted',fault+' failure does not submit documents');}
 const partial=await scenario('partial');check(partial.o.status==='error'&&partial.o.printOutcome==='uncertain'&&partial.o.completedDocuments===1,'partial failure records uncertain outcome and completed document count');
 await recover(partial.journal,partial.io);check(partial.count()===2,'recovery never automatically reprints a partial job');
 const lost=await scenario('lost-ack');check(lost.journal.test.phase==='submitted','lost acknowledgement leaves durable submitted marker');
 await recover(lost.journal,lost.io);check(lost.count()===2&&lost.journal.test.phase==='acknowledged','acknowledgement retry does not submit any document again');
 for(const phase of ['claimed','printing','submitting','submitted']){
  const o=order();claimPrint(o,'agent');if(phase!=='claimed')reportPrint(o,'agent',{status:'printing',claimToken:o.claimToken});let sent=0;
  const entry={id:o.id,claimToken:o.claimToken,phase,completedDocuments:phase==='submitted'?2:0};
  await recover({test:entry},{save:()=>{},report:async(j,status,d)=>{sent++;reportPrint(o,'agent',{...d,status,claimToken:j.claimToken});}});
  check(sent===1&&o.status===(phase==='submitted'?'submitted':'error'),'computer restart at '+phase+' only reconciles status');
 }
 const revoked={id:'revoked',phase:'submitting',claimToken:'old'};
 await recover({revoked},{report:async()=>{const e=Error('Revoked claim');e.status=409;throw e;},save:()=>{}});
 check(revoked.phase==='acknowledged'&&revoked.reconciliationConflict,'revoked old report does not block staff-authorized future jobs');
 const o=partial.o,old=o.claimToken;
 assert.throws(()=>staffFulfilment(o,{action:'recover',resolution:'retry_selected'},'staff'));checks++;
 staffFulfilment(o,{action:'recover',resolution:'retry_selected',documentIds:['b'],agentStopped:true,outputInspected:true,reason:'First document checked; second incomplete spool cleared.'},'staff');
 check(o.status==='queued'&&o.printDocumentIds.join()==='b'&&o.isPaid&&o.amountPaise===1200,'staff-selected retry preserves money and retries only selected document');
 assert.throws(()=>reportPrint(o,'agent',{claimToken:old,status:'submitted'}));checks++;
 claimPrint(o,'agent');reportPrint(o,'agent',{claimToken:o.claimToken,status:'printing'});reportPrint(o,'agent',{claimToken:o.claimToken,status:'submitted',completedDocuments:1});
 assert.throws(()=>staffFulfilment(o,{action:'ready'},'staff'));checks++;
 staffFulfilment(o,{action:'ready',inspectionConfirmed:true,finishingConfirmed:true},'staff');check(o.readyNotification.status==='pending','ready creates durable notification task');
 staffFulfilment(o,{action:'notify',channel:'phone',result:'failed',note:'No answer'},'staff');staffFulfilment(o,{action:'notify',channel:'phone',result:'sent',note:'Customer answered'},'staff');
 check(o.readyNotification.attempts.length===2&&o.readyNotification.status==='sent','notification failure and successful retry remain recorded');
 assert.throws(()=>staffFulfilment(o,{action:'collect',pickupCode:'wrong'},'staff'));checks++;
 staffFulfilment(o,{action:'collect',pickupCode:'ab12'},'staff');const n=o.fulfilmentEvents.length;staffFulfilment(o,{action:'collect',pickupCode:'ab12'},'staff');check(o.status==='collected'&&o.fulfilmentEvents.length===n,'correct code hands over once and repeated acknowledgement is idempotent');
 const unpaid=order();unpaid.isPaid=false;assert.throws(()=>claimPrint(unpaid,'agent'));checks++;
 const refunded=order();refunded.refundState='processed';assert.throws(()=>claimPrint(refunded,'agent'));checks++;
 const cancelled=order();claimPrint(cancelled,'agent');staffFulfilment(cancelled,{action:'recover',resolution:'cancel',agentStopped:true,outputInspected:true,reason:'Printer unavailable; customer requests cancellation.'},'staff');check(cancelled.isPaid&&cancelled.paymentReviewRequired&&cancelled.status==='cancelled','failed fulfilment cancellation retains paid money for reconciliation');
 console.log(checks+' fulfilment checks passed. No physical printer was used.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
