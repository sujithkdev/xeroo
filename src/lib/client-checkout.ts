export async function checkoutAction(body:any){const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Checkout unavailable.');return d.data;}
export async function payForOrder(order:any,config:any){
 const post=async(url:string,body:any)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Payment unavailable.');return d;};
 if(!(window as any).Razorpay)throw Error('Payment window is still loading. Please retry.');
 const remote=await post('/api/create-order',{orderId:order.id,trackingToken:order.trackingToken});
 await new Promise<void>((resolve,reject)=>{
  const widget=new (window as any).Razorpay({key:config.razorpayConfig.keyId,order_id:remote.order_id,amount:remote.amount,currency:'INR',name:config.shopSettings.name,handler:async(response:any)=>{try{await post('/api/verify-payment',{...response,orderId:order.id,trackingToken:order.trackingToken});resolve();}catch(e){reject(e);}},modal:{ondismiss:()=>reject(Error('Payment was not completed. Your order is saved; retry from its tracking page.'))}});
  widget.on('payment.failed',()=>reject(Error('Payment failed. Retry the saved order; do not create a second order.')));widget.open();
 });
}
