 'use client';
import { useShopName } from '@/components/ShopNameContext';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {uploadPrintPdf} from '@/lib/upload-print-pdf';
import {ArrowUpRight,ArrowRight,Printer,Menu,X,Upload,MapPin,Clock,Phone,ShieldCheck,FileText,Layers,Palette,BookOpen,Check,PackageCheck} from 'lucide-react';
import styles from './storefront.module.css';

type Config={shopSettings:{name?:string;address?:string;phone?:string;workingHoursText?:string;googleMapsUrl?:string};printRules:{maxDocumentsPerOrder?:number;maxUploadSizeMB?:number;acceptingOrders?:boolean;orderingPausedReason?:string;allowedPaperSizes?:string[];allowedColorModes?:string[];allowedFinishing?:string[]};pricingConfig:Record<string,number>};
const filters=['All services','Documents','Colour','Finishing'];
export default function Home(){
 const name=useShopName();
 const [config,setConfig]=useState<Config|null>(null),[error,setError]=useState(false),[loading,setLoading]=useState(true),[filter,setFilter]=useState('All services'),[menu,setMenu]=useState(false);
 async function load(){setLoading(true);setError(false);try{const response=await fetch('/api/config',{cache:'no-store'});if(!response.ok)throw Error();setConfig(await response.json());}catch{setError(true);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 const shop=config?.shopSettings,rules=config?.printRules;
 const paused=rules?.acceptingOrders===false;
 const available=!!config&&!loading&&!error&&!paused;
 const price=(key:string)=>{const value=config?.pricingConfig?.[key];return typeof value==='number'&&Number.isFinite(value)&&value>0?`₹${value.toLocaleString('en-IN',{maximumFractionDigits:2})}`:null;};
 const services=[
  {id:'mono',category:'Documents',name:'Everyday documents',description:'Notes, assignments and the everyday essentials. Crisp, clear black & white.',label:'A4 · BLACK & WHITE',price:price('A4_BW'),icon:FileText,available:!!rules?.allowedPaperSizes?.includes('A4')&&!!rules?.allowedColorModes?.includes('bw'),tag:'The everyday essential'},
  {id:'colour',category:'Colour',name:'A little more colour',description:'Bring presentations, illustrations and your best ideas to life.',label:'A4 · COLOUR',price:price('A4_Color'),icon:Palette,available:!!rules?.allowedPaperSizes?.includes('A4')&&!!rules?.allowedColorModes?.includes('color'),tag:'Make an impression'},
  {id:'large',category:'Documents',name:'Room for big ideas',description:'More space for detailed layouts, diagrams and project work.',label:'A3 · BLACK & WHITE',price:price('A3_BW'),icon:Layers,available:!!rules?.allowedPaperSizes?.includes('A3')&&!!rules?.allowedColorModes?.includes('bw'),tag:'Think bigger'},
  {id:'finish',category:'Finishing',name:'The finishing touch',description:'Ask about binding and finishing for a project that feels complete.',label:'BINDING & FINISHING',price:null,icon:BookOpen,available:false,tag:'Ask your shop'},
 ].filter(item=>filter==='All services'||item.category===filter);
 const maps=shop?.googleMapsUrl&&/^https?:\/\//.test(shop.googleMapsUrl)?shop.googleMapsUrl:null;
 const [showContact,setShowContact]=useState(false);
 const router=useRouter();
 const picker=useRef<HTMLInputElement>(null);
 const uploading=useRef(false);
 const [progress,setProgress]=useState('');
 const [uploadError,setUploadError]=useState('');
 const [hasDraft,setHasDraft]=useState(false);
 const draftKey='customerCheckoutV2';
 useEffect(()=>{
   try {const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');setHasDraft(!!draft?.docs?.length);} catch {}
 },[]);
 async function startUpload(files:File[]){
   if(!files.length || uploading.current || !available)return;
   uploading.current=true;setUploadError('');
   try {
     const previous=JSON.parse(sessionStorage.getItem(draftKey)||'null');
     if(previous?.order)throw Error('Continue your previous checkout before starting another order.');
     const docs=[...(previous?.docs || [])];
     const limit=Math.min(rules?.maxDocumentsPerOrder ?? 10,10);
     if(docs.length+files.length>limit)throw Error('Choose up to '+limit+' PDFs per order, including files already added.');
     for(const file of files){
       if(!/\.pdf$/i.test(file.name))throw Error('Choose a PDF document.');
       if(rules?.maxUploadSizeMB && file.size>rules.maxUploadSizeMB*1024*1024)throw Error(file.name+' exceeds the '+rules.maxUploadSizeMB+' MB limit.');
     }
     for(let index=0;index<files.length;index++){
       const file=files[index];
       setProgress('Uploading '+(index+1)+' of '+files.length+' · '+file.name);
       docs.push(await uploadPrintPdf(file));
       sessionStorage.setItem(draftKey,JSON.stringify({...previous,docs,quote:null}));
       setHasDraft(true);
     }
     setProgress('Opening print settings…');router.push('/upload');
   } catch(err){
     setUploadError(err instanceof Error?err.message:'Upload failed. Please try again.');
     setProgress('');uploading.current=false;
   }
 }
 const phone=shop?.phone?.replace(/[^+0-9]/g,'');
 const digits=phone?.replace(/\D/g,'') || '';
 const whatsapp=phone?.startsWith('+') && /^[1-9]\d{7,14}$/.test(digits) ? digits : /^\d{10}$/.test(digits) ? '91'+digits : /^91\d{10}$/.test(digits) ? digits : '';
 const whatsappIcon=<svg aria-hidden="true" viewBox="0 0 24 24" width="29" height="29" fill="none"><path d="M20.7 11.7a8.7 8.7 0 0 1-12.9 7.6L3 20.6l1.3-4.6a8.7 8.7 0 1 1 16.4-4.3Z" stroke="currentColor" strokeWidth="1.8"/><path fill="currentColor" d="M8.3 6.9c-.5 0-1.4.8-1.4 2.1 0 2.7 3.9 6.9 7.5 7.4 1.4.2 2.8-.7 2.9-1.9 0-.3 0-.5-.2-.6l-2.3-1.1c-.2-.1-.4 0-.5.2l-.9 1c-.1.2-.3.2-.6.1-1.3-.5-2.7-1.7-3.4-2.9-.1-.2-.1-.4.1-.5l.7-.9c.1-.2.2-.4.1-.6l-1-2.2c-.1-.2-.3-.2-1-.2Z"/></svg>;
 return <div className={styles.store}>
  <input ref={picker} type="file" accept="application/pdf,.pdf" multiple hidden aria-label="Select PDFs to print" onChange={e=>{const files=Array.from(e.currentTarget.files || []);e.currentTarget.value='';void startUpload(files);}}/>
  <header className={styles.header}><div className={styles.shell+' '+styles.headerInner}>
   <Link href="/" className={styles.brand}><span className={styles.brandIcon}><Printer size={24}/></span><span>{shop?.name||name}<small>YOUR NEIGHBOURHOOD PRINT SHOP</small></span></Link>
   <nav className={styles.desktopNav} aria-label="Shop navigation"><a href="#services">Our services</a><a href="#how-it-works">How it works</a><a href="#visit">Visit the shop</a><Link href="/track">Track order</Link><Link href="/shop/login">Shop login</Link></nav>
   <button disabled={!available || !!progress} onClick={()=>picker.current?.click()} className={styles.headerCta}>Choose PDFs <Upload size={16}/></button>
   <button className={styles.menuButton} onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-label={menu?'Close menu':'Open menu'}>{menu?<X/>:<Menu/>}</button>
  </div>{menu&&<nav className={styles.mobileNav} aria-label="Mobile shop navigation">{[['#services','Our services'],['#how-it-works','How it works'],['#visit','Visit the shop'],['/track','Track order'],['/shop/login','Shop login']].map(([href,label])=><Link key={href} href={href} onClick={()=>setMenu(false)}>{label}<ArrowUpRight size={15}/></Link>)}</nav>}</header>
  <main>
   <section className={styles.shell+' '+styles.hero}>
    <div className={styles.heroCopy}><h1>Print your PDF.<br/><em>Pick it up here.</em></h1>
     <p className={styles.intro}>Choose pages and copies, check your price, then select a pickup time.</p>
     {paused && <p className={styles.notice} role="status">{rules?.orderingPausedReason || 'New orders are paused.'}</p>}
     <div className={styles.actions}><button disabled={!available || !!progress} onClick={()=>picker.current?.click()} className={styles.primary}><Upload size={19}/>{progress?'Uploading…':'Choose PDFs to print'}</button><Link href="/track" className={styles.textLink}>Track an order <ArrowRight size={17}/></Link></div>
     {progress && <p role="status" className={styles.uploadMessage}>{progress}</p>}
     {uploadError && <p role="alert" className={styles.notice}>{uploadError}</p>}
     {hasDraft && !progress && <Link href="/upload" className={styles.textLink}>Continue checkout <ArrowRight size={16}/></Link>}
     {loading && <p role="status">Checking shop availability…</p>}
     {error && <button onClick={load} className={styles.textLink}>Retry loading shop</button>}
     {price('A4_BW') && rules?.allowedPaperSizes?.includes('A4') && rules.allowedColorModes?.includes('bw') && <p className={styles.intro}>A4 black &amp; white · {price('A4_BW')} per page</p>}
    </div>
    <div className={styles.heroVisual}><div className={styles.photoFrame}><img src="/images/print-studio.png" alt="Sample arrangement of violet project booklets, printed pages and stationery" fetchPriority="high" width={1536} height={1024}/></div></div>
   </section>
   <section id="services" className={styles.shell+' '+styles.services}><div className={styles.sectionHeading}><div><h2>Services and prices</h2></div><Link href="/pricing" className={styles.textLink}>See full price list <ArrowUpRight size={17}/></Link></div>
    <div className={styles.filters} role="group" aria-label="Filter print services">{filters.map(item=><button key={item} aria-pressed={filter===item} onClick={()=>setFilter(item)} className={filter===item?styles.selected:''}>{item}</button>)}</div>
    {error&&<div className={styles.notice} role="alert">We couldn’t load this shop’s services and prices. <button onClick={load}>Try again</button></div>}
    {loading&&<p className={styles.notice} role="status">Loading current shop prices…</p>}
    {paused&&<p className={styles.notice} role="status">{rules?.orderingPausedReason||'New orders are paused. Please contact the shop.'}</p>}
    <div className={styles.serviceGrid}>{services.map(item=><article key={item.id} className={styles.serviceCard}><div className={styles.serviceArt+' '+styles[item.id]}><span className={styles.productTag}>{item.tag}</span><div className={styles.paper}><item.icon size={28} strokeWidth={1.4}/><span className={styles.paperTitle}>{item.id==='colour'?'CREATIVE':item.id==='finish'?'PROJECT':item.id==='large'?'BIG IDEAS':'FIELD NOTES'}</span><div className={styles.paperLines}/><div className={styles.paperGraphic}/><small>{item.id==='finish'?'A WORK IN PROGRESS':'MAKE SOMETHING GOOD.'}</small></div>{item.id==='colour'&&<span className={styles.swatches}><i/><i/><i/></span>}</div><div className={styles.serviceInfo}><p className={styles.productLabel}>{item.label}</p><h3>{item.name}</h3><p>{item.description}</p><div className={styles.serviceBottom}><strong>{item.id==='finish'?'Let’s talk':item.available&&item.price?<>{item.price}<small> / page</small></>:config?'Not offered':'Price on request'}</strong>{available&&item.available&&item.price?<Link href="/upload" aria-label={'Order '+item.name}><ArrowUpRight size={21}/></Link>:<Link href="/contact" aria-label={'Enquire about '+item.name}><ArrowUpRight size={21}/></Link>}</div></div></article>)}</div>
    <p className={styles.serviceFootnote}>Service artwork is illustrative. Choose available options and confirm your total during checkout.</p>
   </section>
   <section id="how-it-works" className={styles.process}><div className={styles.shell+' '+styles.processInner}><div><h2>How to order</h2><Link href="/upload" className={styles.textLink}>Let’s get started <ArrowRight size={17}/></Link></div><div className={styles.steps}>{[{title:'Send us your PDF',text:'Upload one or more PDFs. Select the pages and number of copies you need.'},{title:'Review your price',text:'Choose available paper, colour and finishing options. Review your price and request a pickup slot.'},{title:'Track your pickup',text:'Follow your tracking page. Collect when the shop confirms your order is ready.'}].map((step,i)=><div className={styles.step} key={step.title}><span>0{i+1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></div>)}</div></div></section>
   <section id="visit" className={styles.shell+' '+styles.visit}><div className={styles.visitIllustration}><Printer size={60} strokeWidth={1}/><span>GOOD PRINTS.<br/><em>Real people.</em></span><p>Your neighbourhood print counter.</p></div><div className={styles.visitInfo}><p className={styles.eyebrow}>COME SAY HELLO</p><h2>{shop?.name||'Your local print shop'}</h2><p className={styles.visitLead}>Have a question about your project? We’re here to help you get it on paper.</p><div className={styles.contactDetails}><p><MapPin size={18}/><span>{shop?.address||'Contact the shop for its address.'}</span></p><p><Clock size={18}/><span>{shop?.workingHoursText||'Contact the shop for opening hours.'}</span></p>{phone&&<p><Phone size={18}/><a href={'tel:'+phone}>{shop?.phone}</a></p>}</div><div className={styles.actions}>{maps&&<a href={maps} target="_blank" rel="noopener noreferrer" className={styles.primary}>Get directions <ArrowUpRight size={17}/></a>}<Link href="/contact" className={styles.textLink}>Contact the shop <ArrowRight size={17}/></Link></div></div></section>
  </main>
  <div className={styles.whatsapp}>
    {showContact && !whatsapp && <div id="whatsapp-contact" role="status">This shop hasn’t added its WhatsApp number yet. <Link href="/contact">View contact details</Link></div>}
    {whatsapp ? <a href={'https://wa.me/'+whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Chat with the shop on WhatsApp">{whatsappIcon}</a> :
      <button type="button" aria-label="WhatsApp contact information" aria-expanded={showContact} onClick={()=>setShowContact(!showContact)}>{whatsappIcon}</button>}
  </div>
  <footer className={styles.footer}><div className={styles.shell}><div><strong><Printer size={18}/>{shop?.name||name}</strong></div><nav aria-label="Footer navigation"><Link href="/help">Help</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/shop/login">Shop login <ArrowUpRight size={13}/></Link></nav></div></footer>
 </div>;
}
