import crypto from 'node:crypto';
export function audit(o:any,action:string,actor:string,detail:any={}){
 o.fulfilmentEvents||=[];o.fulfilmentEvents.push({id:crypto.randomUUID(),at:new Date().toISOString(),action,actor,...detail});o.updatedAt=new Date().toISOString();
}
export function claimPrint(o:any,agentId:string,capabilities:string[]=[]){
 if(!o||o.refundState||!o.isPaid||!['paid','queued'].includes(o.status)||o.claimToken)throw Error('Job already claimed or not eligible for printing.');
 if(o.quoteId&&(!o.confirmedPickupAt||o.pickupNeedsReschedule||!capabilities.includes('multi-document-v1')))throw Error('Confirm pickup and update the print agent first.');
 Object.assign(o,{status:'downloading',claimToken:crypto.randomUUID(),claimedBy:agentId,claimUpdatedAt:new Date().toISOString(),printOutcome:'not_submitted',completedDocuments:0});
 audit(o,'print_claimed',agentId,{claimToken:o.claimToken});return o;
}
export function reportPrint(o:any,agentId:string,body:any){
 if(!o?.claimToken||body.claimToken!==o.claimToken||o.claimedBy!==agentId)throw Error('Wrong or revoked job claim.');
 const transitions:Record<string,string[]>={downloading:['printing','error'],printing:['submitted','error']};
 if(body.status!==o.status&&!transitions[o.status]?.includes(body.status))throw Error('Invalid agent transition.');
 if(body.status===o.status)return o; // acknowledgement retry must not duplicate events
 const count=(o.printDocumentIds?.length||o.documents?.length||1);
 const completed=Number(body.completedDocuments??o.completedDocuments??0);
 if(!Number.isInteger(completed)||completed<0||completed>count)throw Error('Invalid document progress.');
 o.completedDocuments=completed;o.status=body.status;o.claimUpdatedAt=new Date().toISOString();
 o.printOutcome=body.status==='submitted'?'submitted':body.status==='printing'?'uncertain':body.outcome==='not_submitted'&&o.printOutcome==='not_submitted'?'not_submitted':'uncertain';
 o.printFailure=body.status==='error'?String(body.reason||'Agent interrupted. Inspect printer and spool queue before recovery.').slice(0,1000):undefined;
 audit(o,'print_'+body.status,agentId,{completedDocuments:completed,outcome:o.printOutcome,reason:o.printFailure});return o;
}
export function staffFulfilment(o:any,body:any,actor:string){
 if(!o)throw Error('Order not found.');
 const action=body.action;
 if(action==='reconcile_payment'){
  if(!o.paymentReviewRequired)throw Error('No outstanding payment review.');
  if(body.verified!==true||String(body.note||'').trim().length<20)throw Error('Confirm reconciliation and record the receipt/provider reference and outcome.');
  o.paymentReviewResolvedAt=new Date().toISOString();o.paymentReviewRequired=false;
  audit(o,'payment_review_reconciled',actor,{note:String(body.note).slice(0,1000)});return o;
 }
 if(action==='handling'){
  if(!Number.isFinite(body.minutes)||body.minutes<=0||body.minutes>480||String(body.note||'').trim().length<3)throw Error('Enter 0–480 active handling minutes and a task note.');
  audit(o,'handling_logged',actor,{minutes:body.minutes,note:String(body.note).slice(0,500)});return o;
 }
 if(action==='payment_mismatch'){
  if(String(body.note||'').trim().length<10)throw Error('Describe the mismatch for reconciliation.');
  o.paymentReviewRequired=true;o.paymentReviewResolvedAt=undefined;audit(o,'payment_mismatch',actor,{note:String(body.note).slice(0,1000)});return o;
 }

 if(action==='recover'){
  if(!['downloading','printing','error'].includes(o.status))throw Error('This order is not awaiting print recovery.');
  if(body.agentStopped!==true||body.outputInspected!==true)throw Error('Stop the original agent, clear its spool queue and inspect physical output first.');
  const reason=String(body.reason||'').trim();if(reason.length<10)throw Error('Record what was checked and why this recovery is safe.');
  const previous=o.claimToken;
  if(body.resolution==='output_complete'){if(!o.isPaid||o.refundState)throw Error('Resolve payment before accepting output.');o.status='submitted';o.printOutcome='staff_verified';}
  else if(body.resolution==='retry_selected'){
   if(!o.isPaid||o.refundState)throw Error('Resolve payment before retrying.');
   const ids=(o.documents?.length?o.documents:[{id:'legacy'}]).map((d:any)=>d.id);
   if(!Array.isArray(body.documentIds)||!body.documentIds.length||new Set(body.documentIds).size!==body.documentIds.length||body.documentIds.some((id:any)=>!ids.includes(id)))throw Error('Select the documents that require printing.');
   o.printDocumentIds=body.documentIds;o.status='queued';o.printOutcome='not_submitted';
  }else if(body.resolution==='cancel'){o.status='cancelled';o.paymentReviewRequired=!!o.isPaid;}
  else throw Error('Choose a recovery resolution.');
  o.claimToken=undefined;o.claimedBy=undefined;o.printFailure=undefined;
  audit(o,'staff_recovery',actor,{reason,resolution:body.resolution,documentIds:body.documentIds,revokedClaim:previous});return o;
 }
 if(action==='ready'){
  if(o.status==='ready')return o;
  if(o.status!=='submitted'||!o.isPaid||o.refundState)throw Error('Only paid, submitted output can be marked ready.');
  if(body.inspectionConfirmed!==true||body.finishingConfirmed!==true)throw Error('Inspect all output and confirm finishing before marking ready.');
  o.status='ready';o.collectionStatus='ready';o.inspectedAt=new Date().toISOString();
  o.readyNotification={id:crypto.randomUUID(),status:'pending',channel:'manual',attempts:[],createdAt:new Date().toISOString()};
  audit(o,'output_inspected_ready',actor);return o;
 }
 if(action==='notify'){
  if(o.status!=='ready'||!o.readyNotification)throw Error('Mark inspected output ready before notifying.');
  if(!['phone','sms','whatsapp','in_person'].includes(body.channel)||!['sent','failed'].includes(body.result))throw Error('Record the notification channel and result.');
  const note=String(body.note||'').trim();if(!note)throw Error('Record notification details.');
  o.readyNotification.attempts.push({at:new Date().toISOString(),channel:body.channel,result:body.result,note:note.slice(0,500),actor});
  o.readyNotification.status=body.result;o.readyNotification.channel=body.channel;
  audit(o,'customer_notification_'+body.result,actor,{channel:body.channel});return o;
 }
 if(action==='collect'){
  if(o.status==='collected')return o;
  if(o.status!=='ready'||!o.isPaid||o.refundState||!o.inspectedAt)throw Error('Resolve payment and inspect output before handing over.');
  if(String(body.pickupCode||'').trim().toUpperCase()!==String(o.pickupCode).toUpperCase())throw Error('Incorrect pickup code.');
  o.status='collected';o.collectionStatus='collected';o.collectedAt=new Date().toISOString();
  audit(o,'handed_over',actor);return o;
 }
 throw Error('Unknown fulfilment action.');
}
