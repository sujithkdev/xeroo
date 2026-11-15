import {queryOne} from './db/client';

export class RequestLimitError extends Error {
 constructor(message:string, public status:number){super(message);}
}
const local = new Map<string,{start:number;count:number}>();
// Aggregate tenant budgets cannot be bypassed with forged forwarding headers.
// PostgreSQL makes these counters shared across application instances.
export async function limitExpensiveRequest(shopId:string|null, operation:'upload'|'checkout') {
 const max=operation==='upload'?60:120;
 const window=Math.floor(Date.now()/60000)*60000;
 let count:number;
 if(shopId){
  const row=await queryOne<{requests:number}>(`INSERT INTO request_limits(shop_id,operation,window_start,requests)
   VALUES($1,$2,$3,1) ON CONFLICT(shop_id,operation) DO UPDATE SET
   requests=CASE WHEN request_limits.window_start=EXCLUDED.window_start THEN request_limits.requests+1 ELSE 1 END,
   window_start=EXCLUDED.window_start RETURNING requests`,[shopId,operation,new Date(window)]);
  count=row!.requests;
 }else{
  const current=local.get(operation);
  const bucket=current?.start===window?current:{start:window,count:0};
  count=++bucket.count;local.set(operation,bucket);
 }
 if(count>max)throw new RequestLimitError('Too many requests. Please retry in one minute.',429);
}

// Enforce the limit while reading, including chunked requests without Content-Length.
export async function boundedBody(request:Request,maxBytes:number):Promise<Uint8Array> {
 if(Number(request.headers.get('content-length')||0)>maxBytes)throw new RequestLimitError('Request too large.',413);
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>maxBytes){await reader.cancel();throw new RequestLimitError('Request too large.',413);}chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
