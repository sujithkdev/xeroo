'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
type Printer={id:string;name:string;status:string;supportsColor:boolean;supportsA3:boolean;supportsDuplex:boolean;isDefaultBW:boolean;isDefaultColor:boolean};
type Device={id:string;label:string;last_seen_at:string|null;is_revoked:boolean};
export default function Setup(){
 const [config,setConfig]=useState<any>(null),[printers,setPrinters]=useState<Printer[]>([]),[devices,setDevices]=useState<Device[]>([]);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[url,setUrl]=useState('');
 const read=useCallback(async()=>{
  const res=await fetch('/api/config'),data=await res.json();if(!res.ok)throw Error(data.error||'Could not load setup.');setConfig(data);setPrinters(data.printers||[]);
  const r=await fetch('/api/devices');if(r.ok)setDevices((await r.json()).devices);
 },[]);
 useEffect(()=>{setUrl(window.location.origin+'/upload');void read().catch(e=>setMessage(e.message));},[read]);
 async function action(path:string,method:string,body:any){setBusy(true);setMessage('');try{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');await read();setMessage(path.includes('/test')?'Test queued. Inspect the physical sheet, then confirm output in Needs attention.':'Saved.');}catch(e){setMessage(e instanceof Error?e.message:'Request failed');}finally{setBusy(false);}}
 function capability(id:string,key:keyof Printer,value:boolean){setPrinters(ps=>ps.map(p=>p.id===id?{...p,[key]:value}:(key==='isDefaultBW'||key==='isDefaultColor')&&value?{...p,[key]:false}:p));}
 if(!config)return <main className="p-8"><h1 className="page-heading">Computer & printer setup</h1><p>{message||'Loading…'}</p></main>;
 const local=config.capabilities?.localMode;
 return <main className="p-5 md:p-8 max-w-4xl space-y-6"><h1 className="page-heading">Set up your shop</h1>
 <section className="surface p-5 space-y-3"><h2 className="font-semibold">1. Register the printing computer</h2><p>Install Xeroo Desk, enter this shop’s address, and sign in as the owner. In the desktop menu, choose <strong>Shop → Register this computer</strong>. One computer prints for this shop.</p>{local&&<p>This is local mode. Hosted account registration and phone access require your shop’s HTTPS address.</p>}
 {devices.filter(d=>!d.is_revoked).map(d=><div className="flex gap-4 items-center" key={d.id}><span>{d.label} · {d.last_seen_at&&Date.now()-Date.parse(d.last_seen_at)<30000?'Connected':'Offline'}</span><button className="btn-secondary" disabled={busy} onClick={()=>{if(window.confirm('Stop this computer receiving new jobs? Check any jobs already printing before replacing it.'))void action('/api/devices','DELETE',{id:d.id});}}>Revoke computer</button></div>)}
 <button className="btn-secondary" disabled={busy} onClick={()=>void read().catch(e=>setMessage(e.message))}>Refresh connection and printers</button></section>
 <section className="surface p-5 space-y-4"><h2 className="font-semibold">2. Connect and configure the printer</h2><p>Connect USB or network printers and install their Windows drivers. Refresh above after Windows can print a test page. Detection does not confirm colour, duplex, paper supply, or successful output.</p>
 {!printers.length&&<p>No printers detected yet.</p>}{printers.map(p=><div className="border rounded-xl p-4 space-y-3" key={p.id}><strong>{p.name}</strong><p>{p.status==='offline'?'Not currently detected online':'Detected in Windows'}</p><div className="flex flex-wrap gap-4">{([['supportsColor','Colour'],['supportsA3','A3'],['supportsDuplex','Duplex'],['isDefaultBW','Default B&W'],['isDefaultColor','Default colour']] as const).map(([key,label])=><label key={key}><input type="checkbox" checked={!!p[key]} onChange={e=>capability(p.id,key,e.target.checked)}/> {label}</label>)}</div><button className="btn-secondary" disabled={busy||!config.autoPrintEnabled} onClick={()=>void action('/api/printers/test','POST',{printerId:p.id})}>Queue one test page</button></div>)}
 <button className="btn-primary" disabled={busy||!printers.length} onClick={()=>void action('/api/config','POST',{printers})}>Save printer capabilities</button>
 <p>Save capabilities before testing. Enabling the queue permits paid pending orders to print.</p><button className="btn-secondary" disabled={busy} onClick={()=>{if(config.autoPrintEnabled||window.confirm('Enable printing of paid pending orders?'))void action('/api/config','POST',{autoPrintEnabled:!config.autoPrintEnabled});}}>{config.autoPrintEnabled?'Pause printing':'Enable print queue'}</button>
 <p><Link href="/shop/inbox" className="underline">Inspect test output and confirm it in Needs attention</Link></p></section>
 <section className="surface p-5 space-y-3"><h2 className="font-semibold">3. Check prices and invite customers</h2><p><Link href="/shop/pricing" className="underline">Review prices</Link> and <Link href="/shop/settings" className="underline">shop details</Link> before enabling customer orders.</p><button className="btn-secondary" disabled={busy} onClick={()=>void action('/api/config','POST',{acceptingOrders:!config.shopSettings.acceptingOrders})}>{config.shopSettings.acceptingOrders?'Pause customer orders':'Enable customer orders'}</button>
 {!local&&<><p>Customers scan this code to upload. This link is public; it does not grant staff access.</p>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/api/customer-qr" alt="Customer ordering QR code" width={240} height={240}/><a href={url} className="underline break-all">{url}</a></>}</section>
 {message&&<p role="status" className="surface p-4">{message}</p>}</main>;
}
