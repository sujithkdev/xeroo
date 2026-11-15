import crypto from 'node:crypto';
export const stages=['Staff testing','Invited customers','Limited live pilot','Busy-period validation','Issue remediation','Individual shop rollout'];
export const gates=[['synthetic','printerRecovery','paymentRecovery','backupRestore'],['consent','support','privacy'],['livePayment','dailyReview'],['busyPeriod','restartRecovery'],['recurringIssuesFixed'],['shopTraining','shopCapacity','shopContacts']];
export function launchMetrics(orders:any[],now=Date.now()){
 const since=now-30*86400000;
 const cohort=orders.filter(o=>Date.parse(o.createdAt)>=since&&!o.synthetic);
 const events=(o:any)=>o.fulfilmentEvents||[];
 const failures=cohort.filter(o=>['error','failed'].includes(o.status)||events(o).some((e:any)=>e.action==='print_error'));
 const reprints=cohort.filter(o=>events(o).some((e:any)=>e.action==='staff_recovery'&&e.resolution==='retry_selected'));
 const handling=cohort.flatMap(o=>events(o).filter((e:any)=>e.action==='handling_logged').map((e:any)=>e.minutes));
 const ready=cohort.filter(o=>o.confirmedPickupAt&&o.inspectedAt);
 const onTime=ready.filter(o=>Date.parse(o.inspectedAt)<=Date.parse(o.confirmedPickupAt));
 const lateOpen=cohort.filter(o=>o.confirmedPickupAt&&!o.inspectedAt&&!['cancelled','failed'].includes(o.status)&&Date.parse(o.confirmedPickupAt)<now);
 const paymentMismatches=cohort.filter(o=>events(o).some((e:any)=>e.action==='payment_mismatch'));
 return {windowDays:30,total:cohort.length,failures:failures.length,failureRate:cohort.length?failures.length/cohort.length:null,reprints:reprints.length,paymentMismatches:paymentMismatches.length,paymentReviews:cohort.filter(o=>o.paymentReviewRequired&&!o.paymentReviewResolvedAt).length,handlingSamples:handling.length,handlingMinutes:handling.length?handling.reduce((a:number,b:number)=>a+b,0)/handling.length:null,onTime:onTime.length,readyMeasured:ready.length,onTimeRate:ready.length?onTime.length/ready.length:null,overdueOpen:lateOpen.length,notificationPending:cohort.filter(o=>o.status==='ready'&&o.readyNotification?.status!=='sent').length,unknownReadiness:cohort.filter(o=>['ready','collected'].includes(o.status)&&(!o.confirmedPickupAt||!o.inspectedAt)).length};
}
export function mutateLaunch(state:any,body:any,actor:string){
 state.stage??=0;state.gates??={};state.issues??=[];state.history??=[];state.invitedPhones??=[];state.dailyLimit??=20;
 if(body.action==='enable')state.enabled=true;
 else if(body.action==='pause')state.paused=true;
 else if(body.action==='resume')state.paused=false;
 else if(body.action==='settings'){
  const phones=String(body.phones||'').split(/[\s,]+/).filter(Boolean);
  if(phones.length>100||phones.some(p=>!/^\+?\d{10,15}$/.test(p)))throw Error('Provide at most 100 valid invited phone numbers.');
  if(!Number.isInteger(body.dailyLimit)||body.dailyLimit<1||body.dailyLimit>1000)throw Error('Daily pilot limit must be 1–1000.');
  state.invitedPhones=Array.from(new Set(phones));state.dailyLimit=body.dailyLimit;
 }else if(body.action==='gate'){
  if(!gates.flat().includes(body.key)||String(body.evidence||'').trim().length<10)throw Error('Record test evidence or an operational reference.');
  state.gates[body.key]={evidence:String(body.evidence).slice(0,2000),actor,at:new Date().toISOString()};
 }else if(body.action==='advance'){
  if(!state.enabled||state.paused)throw Error('Enable and resume the pilot before advancing.');
  if(state.stage>=stages.length-1)throw Error('Already at the final rollout stage.');
  if(gates[state.stage].some(k=>!state.gates[k]))throw Error('Complete this stage’s evidence checklist.');
  if(state.issues.some((i:any)=>i.status!=='resolved'&&i.severity==='critical'))throw Error('Resolve critical issues before advancing.');
  state.stage++;
 }else if(body.action==='issue'){
  if(!['critical','normal'].includes(body.severity)||String(body.title||'').trim().length<5)throw Error('Provide an issue and severity.');
  state.issues.push({id:crypto.randomUUID(),title:String(body.title).slice(0,300),severity:body.severity,status:'open',owner:actor,createdAt:new Date().toISOString()});
 }else if(body.action==='resolve'){
  const issue=state.issues.find((i:any)=>i.id===body.id);if(!issue||String(body.evidence||'').trim().length<10)throw Error('Provide the fix and retest evidence.');
  issue.status='resolved';issue.resolution=String(body.evidence).slice(0,2000);issue.resolvedAt=new Date().toISOString();
 }else throw Error('Unknown launch action.');
 state.history.push({at:new Date().toISOString(),actor,action:body.action,stage:state.stage,key:body.key,id:body.id});return state;
}
export function enforceLaunch(state:any,orders:any[],input:any,now=Date.now()){
 if(!state?.enabled)return;
 if(state.paused)throw Error('This shop has paused its pilot. Please contact staff.');
 if((state.stage??0)===0&&input.source!=='counter')throw Error('This shop is currently testing with staff.');
 if(state.stage===1&&!state.invitedPhones?.includes(String(input.customerPhone||'').trim())&&input.source!=='counter')throw Error('This pilot is currently limited to invited customers. Contact the shop.');
 if(state.stage<5){const recent=orders.filter(o=>Date.parse(o.createdAt)>now-86400000&&!['cancelled','failed'].includes(o.status));if(recent.length>=(state.dailyLimit||20))throw Error('The pilot order limit for the last 24 hours has been reached.');}
}
