'use strict';
// Dependencies are injected so interruption cases can be tested without printer hardware.
async function execute(job, io) {
 const entry={id:job.id,claimToken:job.claimToken,phase:'claimed',completedDocuments:0,at:new Date().toISOString()};
 io.save(entry);
 try {
  const plan=await io.prepare(job); // validate every file/printer before any submission
  await io.report(job,'printing',{completedDocuments:0});
  entry.phase='printing';io.save(entry);
  for(let i=0;i<plan.length;i++){
   entry.documentIndex=i;entry.phase='submitting';io.save(entry); // persist BEFORE crossing the spool boundary
   await io.submit(plan[i]);
   entry.completedDocuments=i+1;io.save(entry);
  }
  entry.phase='submitted';io.save(entry);
  await io.report(job,'submitted',{completedDocuments:entry.completedDocuments});
  entry.phase='acknowledged';io.save(entry);
 }catch(error){
  if(entry.phase==='submitted')return; // retry only the acknowledgement, never submission
  entry.report={outcome:entry.phase==='claimed'?'not_submitted':'uncertain',completedDocuments:entry.completedDocuments,reason:String(error.message||error).slice(0,1000)};
  entry.phase='failed';io.save(entry);
  try{await io.report(job,'error',entry.report);entry.phase='acknowledged';io.save(entry);}catch{} // retain durable pending report
 }
}
async function recover(entries,io){
 for(const entry of Object.values(entries)){
  if(entry.phase==='acknowledged')continue;
  const status=entry.phase==='submitted'?'submitted':'error';
  const report=entry.report||{completedDocuments:entry.completedDocuments||0,outcome:entry.phase==='claimed'?'not_submitted':'uncertain',reason:'Agent restarted; physical output and spool queue need inspection.'};
  try{await io.report(entry,status,report);}catch(error){
   if(error.status!==409)throw error;
   // Staff may have revoked this lease. Keep the old attempt, but never let it block a new staff-authorized claim.
   entry.reconciliationConflict=String(error.message||error);
  }
  entry.phase='acknowledged';io.save(entry);
 }
}
module.exports={execute,recover};
