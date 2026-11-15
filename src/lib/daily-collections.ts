import type { Order } from './types';

export function shopDate(at: string | Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

export function receiptTime(order: Order & {fulfilmentEvents?: {action:string; at:string}[]}) {
  return order.paidAt ?? order.fulfilmentEvents?.find(event =>
    ['cash_received','upi_receipt_verified'].includes(event.action))?.at;
}

export function dailyCollections(orders: Order[], date: string, zone: string) {
  const result = {cash:0, upi:0, online:0, refunds:0, net:0, unpaid:0, undated:0};
  for (const order of orders) {
    if (order.synthetic) continue;
    const amount = Math.round(order.amount * 100);
    if (!order.isPaid) {
      if (!['cancelled','failed'].includes(order.status) && shopDate(order.createdAt,zone) === date) result.unpaid++;
      continue;
    }
    const paid = receiptTime(order);
    if (!paid) result.undated++;
    else if (shopDate(paid,zone) === date) {
      const method = order.paymentMethod === 'cash' ? 'cash' : order.paymentMethod === 'upi_qr' ? 'upi' : 'online';
      result[method] += amount;
    }
    if (order.refundState === 'processed') {
      if (!order.refundedAt) result.undated++;
      else if (shopDate(order.refundedAt,zone) === date) result.refunds += amount;
    }
  }
  result.net = result.cash + result.upi + result.online - result.refunds;
  return result;
}

type ReportOrder = Order & { collectedAt?: string };
export const emptyDay = () => ({ received:0, web:0, counter:0, completed:0, cancelled:0, cash:0, upi:0, online:0, refunds:0, net:0 });
export function orderReport(orders: ReportOrder[], zone:string) {
  const days:Record<string,ReturnType<typeof emptyDay>> = {};
  const details:Record<string,Map<string,{order:Order;events:string[]}>> = {};
  const outstanding:Order[] = [];
  let outstandingPaise=0, undated=0;
  const formatter = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
  function event(order:Order, at:string, label:string) {
    const day=formatter.format(new Date(at));
    const entries=details[day] ??= new Map();
    const entry=entries.get(order.id) ?? {order,events:[]};
    entry.events.push(label); entries.set(order.id,entry);
    return days[day] ??= emptyDay();
  }
  for(const order of orders){
    if(order.synthetic)continue;
    const created=event(order,order.createdAt,'Received');
    created.received++;
    if(order.source==='web')created.web++;
    if(order.source==='counter')created.counter++;
    if(order.status==='cancelled')created.cancelled++;
    if(order.collectedAt)event(order,order.collectedAt,'Collected by customer').completed++;
    if(!order.isPaid){
      if(!['cancelled','failed','collected','completed'].includes(order.status)){
        outstanding.push(order);outstandingPaise+=Math.round(order.amount*100);
      }
      continue;
    }
    const amount=Math.round(order.amount*100), paid=receiptTime(order);
    if(paid){
      const day=event(order,paid,'Payment received');
      day[order.paymentMethod==='cash'?'cash':order.paymentMethod==='upi_qr'?'upi':'online']+=amount;
      day.net+=amount;
    }else undated++;
    if(order.refundState==='processed'){
      if(order.refundedAt){const day=event(order,order.refundedAt,'Refund processed');day.refunds+=amount;day.net-=amount;}
      else undated++;
    }
  }
  return {days,details,outstanding,outstandingPaise,undated};
}

export function offsetDay(day:string,delta:number){
  const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);
}
