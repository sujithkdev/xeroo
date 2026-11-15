 'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {apiFetch} from '@/lib/apiFetch';
export default function SubscriptionsPage(){
 const [shops,setShops]=useState<{id:string;name:string;plan?:string}[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(){setLoading(true);setError('');try{const response=await apiFetch('/api/admin/shops');setShops((await response.json()).shops||[]);}catch{setError('Could not load assigned shop plans.');}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 return <main className="p-5 md:p-8 space-y-5"><h1 className="page-heading">Plans &amp; billing</h1><p className="surface p-4 text-sm">Billing is not connected. This screen shows assigned shop plans only. Payments, subscription status and renewal dates are not recorded here.</p>{error&&<p role="alert">{error} <button className="btn-secondary" onClick={load}>Retry</button></p>}{loading?<p>Loading plans…</p>:!error&&<div className="surface overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left p-4">Shop</th><th className="text-left p-4">Assigned plan</th></tr></thead><tbody>{shops.map(shop=><tr key={shop.id} className="border-t"><td className="p-4"><Link href={shop.id==='local'?'/shop':'/admin/shops/'+shop.id}>{shop.name}</Link></td><td className="p-4 capitalize">{shop.plan||'Not configured'}</td></tr>)}{!shops.length&&<tr><td colSpan={2} className="p-4">No shops found.</td></tr>}</tbody></table></div>}</main>;
}
