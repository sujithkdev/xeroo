type RefundOrder={id?:string;isPaid?:boolean;paymentId?:string;refundState?:string;status:string;paymentMethod?:string};
export function canRequestRefund(order:RefundOrder):boolean {
 return !!order.isPaid&&!!order.paymentId&&!order.refundState&&!['printing','downloading','queued','paid','submitted'].includes(order.status);
}
export function refundRequest(order:RefundOrder,reason:string,cashReturned:boolean){
 if(!order.id||!canRequestRefund(order))throw Error('This order is not eligible for a refund.');
 if(!reason.trim())throw Error('Enter a refund reason.');
 if(order.paymentMethod==='cash'&&!cashReturned)throw Error('Confirm cash was returned to the customer.');
 return {id:order.id,reason:reason.trim().slice(0,500),cashReturned:order.paymentMethod==='cash'&&cashReturned};
}
