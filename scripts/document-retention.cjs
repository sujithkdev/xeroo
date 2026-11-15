'use strict';
// Shared policy for local files and PostgreSQL/object storage. Missing dates fail closed.
function eligibleDocument(meta,orders,quotes,days,now=Date.now()){
 if(!Number.isInteger(days)||days<1)return false;
 const uploaded=Date.parse(meta.createdAt);
 if(!Number.isFinite(uploaded))return false;
 const age=days*86400000;
 if(uploaded+age>now)return false;
 if(meta.expiresAt&&(!Number.isFinite(Date.parse(meta.expiresAt))||Date.parse(meta.expiresAt)>now))return false;
 const url='/api/file/'+meta.id;
 if(quotes.some(q=>!q.orderId&&Date.parse(q.expiresAt)>now&&q.items?.some(d=>d.fileUrl===url)))return false;
 for(const order of orders){
  if(order.paymentReviewRequired||['pending','needs_review'].includes(order.refundState))return false;
  if(!['collected','cancelled'].includes(order.status))return false;
  // Retain cancelled paid orders until their refund is reconciled.
  if(order.status==='cancelled'&&order.isPaid&&order.refundState!=='processed')return false;
  const terminal=Date.parse(order.updatedAt||order.createdAt);
  if(!Number.isFinite(terminal)||terminal+age>now)return false;
 }
 return true;
}
module.exports={eligibleDocument};
