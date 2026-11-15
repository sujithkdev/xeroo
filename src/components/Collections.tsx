'use client';
import Link from 'next/link';
import {useEffect, useMemo, useState} from 'react';
import {emptyDay,offsetDay,orderReport,shopDate} from '@/lib/daily-collections';
import type {Order} from '@/lib/types';

export default function Collections({selectDate=false}:{selectDate?:boolean}) {
  const [data,setData]=useState<{orders:Order[];zone:string}|null>(null);
  const [period,setPeriod]=useState('Last 7 days');
  const [custom,setCustom]=useState({from:'',to:''});
  const [selected,setSelected]=useState('');
  const [showUnpaid,setShowUnpaid]=useState(false);
  const [error,setError]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    async function load(){
      try {
        const read=async(path:string)=>{
          const response=await fetch(path,{cache:'no-store',signal:controller.signal});
          if(!response.ok)throw Error();
          return response.json();
        };
        const [orders,config]=await Promise.all([read('/api/orders'),read('/api/config')]);
        setData({orders:orders.orders,zone:config.shopSettings.timezone || 'Asia/Kolkata'});setError(false);
      } catch {if(!controller.signal.aborted)setError(true);}
    }
    void load();const timer=setInterval(load,30000);
    return ()=>{controller.abort();clearInterval(timer);};
  },[]);
  const report=useMemo(()=>data && orderReport(data.orders,data.zone),[data]);
  if(error)return <p role="alert" className="surface p-5">Could not load the report. Retrying shortly.</p>;
  if(!data || !report)return <p className="surface p-5" role="status">Loading shop figures…</p>;
  const today=shopDate(new Date(),data.zone);
  const current=report.days[today] || emptyDay();
  const money=(n:number)=>(n/100).toLocaleString('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:0,maximumFractionDigits:2});
  const label=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  const orderLink=(order:Order)=><Link className="text-indigo-700 underline" href={'/shop/orders/'+order.id}>{order.fileName || order.id}</Link>;
  if(!selectDate)return <section aria-label="Today's shop figures" className="grid gap-4 md:grid-cols-3">
    <div className="surface p-5"><h2>Orders received today</h2><strong className="block text-3xl mt-2">{current.received}</strong><p className="text-sm text-slate-600">{current.web} website · {current.counter} walk-in · {current.cancelled} cancelled</p></div>
    <Link href="/shop/daily-report" className="rounded-xl bg-indigo-950 text-white p-5"><h2>Net collected today</h2><strong className="block text-3xl mt-2">{money(current.net)}</strong><span className="text-sm underline">View daily report</span></Link>
    <button aria-expanded={showUnpaid} onClick={()=>setShowUnpaid(!showUnpaid)} className="surface p-5 text-left"><span>Outstanding payments</span><strong className="block text-3xl mt-2">{money(report.outstandingPaise)}</strong><span className="text-sm text-indigo-700 underline">{report.outstanding.length} open unpaid orders · All dates</span></button>
    {showUnpaid && <div className="surface p-5 md:col-span-3"><h3 className="font-semibold">Open unpaid orders</h3>{!report.outstanding.length && <p>No outstanding payments.</p>}{report.outstanding.map(o=><div className="flex justify-between gap-4 border-b py-2" key={o.id}>{orderLink(o)}<span>{money(Math.round(o.amount*100))}</span></div>)}</div>}
  </section>;
  const from=period==='Custom'?(custom.from||today):period==='This month'?today.slice(0,7)+'01':period==='Today'?today:offsetDay(today,-6);
  const to=period==='Custom'?(custom.to||today):today;
  const valid=from<=to && to<=today && to<=offsetDay(from,365);
  const days:string[]=[];
  if(valid)for(let date=to;date>=from;date=offsetDay(date,-1))days.push(date);
  const columns=[['received','Orders'],['completed','Picked up'],['cash','Cash'],['upi','Verified UPI'],['online','Online'],['refunds','Refunds'],['net','Net collected']] as const;
  const sum=emptyDay();
  for(const day of days)for(const [key] of columns)sum[key]+=report.days[day]?.[key]||0;
  const entries=selected && days.includes(selected)?Array.from(report.details[selected]?.values() || []):null;
  return <section className="space-y-5">
    <header><h1 className="page-heading">Daily report</h1><p className="text-sm text-slate-600">Collections and pickups by day · {data.zone}</p></header>
    <div className="flex flex-wrap gap-2">{['Today','Last 7 days','This month','Custom'].map(value=><button key={value} aria-pressed={period===value} onClick={()=>{setPeriod(value);setSelected('');}} className={'rounded-lg border px-4 py-2 text-sm '+(period===value?'bg-indigo-950 text-white':'bg-white')}>{value}</button>)}</div>
    {period==='Custom' && <div className="flex flex-wrap gap-4">{(['from','to'] as const).map(key=><label key={key} className="capitalize">{key} <input className="input-field" type="date" value={custom[key]||today} max={today} onChange={e=>setCustom({...custom,[key]:e.target.value})}/></label>)}</div>}
    {!valid ? <p role="alert">Choose dates in order, up to one year, ending today or earlier.</p> : <div className="surface overflow-x-auto"><table className="w-full whitespace-nowrap text-right text-sm"><caption className="text-left p-4 font-semibold">{label(from)} – {label(to)}</caption>
    <thead className="bg-slate-50"><tr><th className="text-left p-3">Date</th>{columns.map(([key,title])=><th className="p-3" key={key}>{title}</th>)}</tr></thead>
    <tbody>{days.map(day=><tr key={day} className={'border-t '+(selected===day?'bg-indigo-50':'')}><th className="p-3 text-left"><button className="text-indigo-700 underline" onClick={()=>setSelected(day)}>{label(day)}</button></th>{columns.map(([key])=>{const n=report.days[day]?.[key]||0;return <td key={key} className="p-3 tabular-nums">{key==='received'||key==='completed'?n:money(n)}</td>;})}</tr>)}</tbody>
    <tfoot className="bg-indigo-950 text-white font-semibold"><tr><th className="text-left p-3">Total</th>{columns.map(([key])=><td className="p-3" key={key}>{key==='received'||key==='completed'?sum[key]:money(sum[key])}</td>)}</tr></tfoot></table></div>}
    {entries && <section className="surface p-5"><h2 className="font-semibold">Orders · {label(selected)}</h2>{!entries.length && <p>No order activity.</p>}{entries.map(({order,events})=><div key={order.id} className="flex flex-wrap justify-between gap-2 border-b py-2">{orderLink(order)}<span>{events.join(' · ')}</span></div>)}</section>}
    {report.undated>0 && <p className="text-sm text-slate-600">{report.undated} historical payment or refund records have no confirmed date and are excluded from dated totals.</p>}
  </section>;
}
