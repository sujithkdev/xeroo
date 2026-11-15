import crypto from 'node:crypto';
export interface PrintSelection { fileUrl:string; copies:number; paperSize:string; colorMode:string; duplex:string; orientation?:string; pageRange?:string; finishing?:string }
export interface CheckoutItem extends PrintSelection { id:string; fileName:string; sourcePages:number; pages:number; selectedPages:number[]; amountPaise:number; fileSize:number }
export interface Quote { id:string; items:CheckoutItem[]; amountPaise:number; units:number; createdAt:string; expiresAt:string; reservation?:{id:string; requestedAt:string; expiresAt:string}; orderId?:string }
export interface CheckoutRules { maxCopies:number; maxPages:number; maxDocumentsPerOrder?:number; allowedPaperSizes:string[]; allowedColorModes:string[]; allowDuplex:boolean; allowedFinishing?:string[]; slotCapacity?:number; slotPageCapacity?:number; slotDurationMinutes?:number; minPrepMinutes?:number; workingHoursStart:string; workingHoursEnd:string; timezone?:string; acceptingOrders?:boolean }

/** One-based input, zero-based output. Reject ambiguous ranges rather than silently changing output. */
export function selectedPages(range:string|undefined,total:number):number[] {
 if(!range?.trim())return Array.from({length:total},(_,i)=>i);
 if(range.length>2000)throw Error('Page selection is too long.');
 const pages:number[]=[];const seen=new Set<number>();
 for(const part of range.split(',')){
  const m=/^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim());if(!m)throw Error('Use page numbers or ranges, for example 1-3,5.');
  const start=Number(m[1]),end=Number(m[2]||m[1]);
  if(start<1||end<start||end>total)throw Error(`Pages must be between 1 and ${total}, in ascending ranges.`);
  for(let p=start;p<=end;p++){if(seen.has(p))throw Error('Page selections must not overlap.');seen.add(p);pages.push(p-1);}
 }
 return pages;
}
export function priceItem(input:PrintSelection,doc:{fileName:string;pages:number;size:number},rules:CheckoutRules,prices:Record<string,number>):CheckoutItem {
 const copies=Number(input.copies);if(!Number.isSafeInteger(copies)||copies<1||copies>rules.maxCopies)throw Error('Invalid copy count.');
 if(!rules.allowedPaperSizes.includes(input.paperSize)||!rules.allowedColorModes.includes(input.colorMode)||!['simplex','duplex'].includes(input.duplex)||(input.duplex==='duplex'&&!rules.allowDuplex))throw Error('Unsupported print settings.');
 const orientation=input.orientation||'portrait';if(!['portrait','landscape'].includes(orientation))throw Error('Invalid orientation.');
 const finishing=input.finishing||'none';if(finishing!=='none'&&!(rules.allowedFinishing||['none']).includes(finishing))throw Error('This shop does not offer the selected finishing service.');
 const pages=selectedPages(input.pageRange,doc.pages);if(doc.pages>rules.maxPages)throw Error('Document exceeds shop limits.');
 // Pricing strategy:
 // - Simplex: charge per page  → pages.length × base_rate
 // - Duplex:  charge per SHEET → ceil(pages/2) × sheet_rate
 //   Sheet rate is stored under key A4_BW_Sheet / A4_Color_Sheet.
 //   If no sheet rate exists, fall back to base_rate × 2 (same cost as 2 simplex pages).
 const baseKey=`${input.paperSize}_${input.colorMode==='color'?'Color':'BW'}`;
 const sheetKey=`${baseKey}_Sheet`;
 const isDuplex=input.duplex==='duplex';
 let printCostPaise:number;
 if(isDuplex){
  const sheetRate=prices[sheetKey];
  const fallbackRate=prices[baseKey];
  if(!Number.isSafeInteger(sheetRate||0)&&!Number.isSafeInteger(fallbackRate||0))throw Error('A selected service has no valid shop price.');
  const ratePerSheet=Number.isSafeInteger(sheetRate)&&sheetRate>0?sheetRate:fallbackRate*2;
  const sheets=Math.ceil(pages.length/2);
  printCostPaise=sheets*ratePerSheet;
 }else{
  const rate=prices[baseKey];
  if(!Number.isSafeInteger(rate)||rate<=0)throw Error('A selected service has no valid shop price.');
  printCostPaise=pages.length*rate;
 }
 const extra=finishing==='none'?0:prices[finishing];
 if(!Number.isSafeInteger(extra)||extra<0)throw Error('A selected service has no valid shop price.');
 const amountPaise=(printCostPaise+extra)*copies;if(!Number.isSafeInteger(amountPaise)||amountPaise<1)throw Error('Invalid order total.');
 return {...input,id:crypto.randomUUID(),copies,orientation,finishing,fileName:doc.fileName,fileSize:doc.size,sourcePages:doc.pages,pages:pages.length,selectedPages:pages,amountPaise};
}
export function scheduleSlots(rules:CheckoutRules,now=Date.now()):string[] {
 const duration=rules.slotDurationMinutes??30,prep=rules.minPrepMinutes??30;
 if(!Number.isInteger(duration)||duration<5||duration>240||!Number.isInteger(prep)||prep<0)throw Error('Shop pickup settings are invalid.');
 const parseMinute=(s:string)=>{const m=/^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(s);if(!m)throw Error('Invalid shop hours.');return Number(m[1])*60+Number(m[2]);};
 const open=parseMinute(rules.workingHoursStart),close=parseMinute(rules.workingHoursEnd);
 if(close<=open)throw Error('Shop closing time must be after opening time.');
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:rules.timezone||'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const result:string[]=[],seen=new Set<string>();
 // Traverse real UTC instants: nonexistent DST times are skipped and repeated
 // wall-clock slots are offered once. No assumed timezone-offset range.
 for(let instant=Math.ceil((now+prep*60000)/60000)*60000;instant<now+7*86400000;instant+=60000){
  const parts=formatter.formatToParts(instant);
  const get=(type:string)=>parts.find(p=>p.type===type)!.value;
  const minute=Number(get('hour'))*60+Number(get('minute'));
  if(minute<=open||minute>close||(minute-open)%duration!==0)continue;
  const key=[get('year'),get('month'),get('day'),minute].join('-');
  if(seen.has(key))continue;
  seen.add(key);result.push(new Date(instant).toISOString());
 }
 return result;
}

export function occupied(order:any,now=Date.now()):boolean {
 if(order.pickupNeedsReschedule)return false;
 if(['cancelled','failed','collected'].includes(order.status)||order.refundState)return false;
 if(order.isPaid)return true;
 return !!order.reservationExpiresAt&&Date.parse(order.reservationExpiresAt)>now;
}
export function availableSlot(at:string,quote:Quote,quotes:Quote[],orders:any[],rules:CheckoutRules,now=Date.now()):boolean {
 const holds=quotes.filter(q=>q.id!==quote.id&&!q.orderId&&q.reservation?.requestedAt===at&&Date.parse(q.reservation.expiresAt)>now);
 const jobs=orders.filter(o=>(o.confirmedPickupAt||o.requestedPickupAt)===at&&occupied(o,now));
 const units=holds.reduce((s,q)=>s+q.units,0)+jobs.reduce((s,o)=>s+(o.capacityUnits||o.pages*o.copies||0),0);
 return holds.length+jobs.length<(rules.slotCapacity??5)&&units+quote.units<=(rules.slotPageCapacity??500);
}

export function validatePickupRules(r:any){
 for(const [key,min,max] of [['slotCapacity',1,1000],['slotPageCapacity',1,100000],['slotDurationMinutes',5,240],['minPrepMinutes',0,10080]] as const){
  if(r[key]!==undefined&&(!Number.isSafeInteger(r[key])||r[key]<min||r[key]>max))throw Error('Invalid '+key+'.');
 }
 for(const key of ['workingHoursStart','workingHoursEnd'])if(r[key]!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(r[key]))throw Error('Invalid shop opening hours.');
 if(r.workingHoursStart&&r.workingHoursEnd&&r.workingHoursStart>=r.workingHoursEnd)throw Error('Closing time must be after opening time.');
}
