// Supported Windows agent. Never equate spool submission with physical completion.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const runner = require('./agent/runner.cjs');
const base = new URL(process.env.BACKEND_URL || 'http://127.0.0.1:3000');
const token = process.env.AGENT_TOKEN || '';
const agentId = process.env.AGENT_ID || os.hostname();
const stateDir = path.resolve(process.env.AGENT_DATA_DIR || path.join(__dirname, 'data', 'agent'));
const sumatra = process.env.SUMATRA_PATH || path.join(__dirname, 'SumatraPDF.exe');
if (token.length < 32) throw new Error('Run npm run setup first: AGENT_TOKEN must contain at least 32 characters.');
if (base.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Remote servers require HTTPS.');
fs.mkdirSync(stateDir, { recursive: true });
const journalFile = path.join(stateDir, 'journal.json');
let journal = fs.existsSync(journalFile) ? JSON.parse(fs.readFileSync(journalFile, 'utf8')) : {};
let printers = [];
let busy = false;

function persist() {
  const temp = journalFile + '.tmp';
  const fd=fs.openSync(temp,'w');try{fs.writeFileSync(fd,JSON.stringify(journal,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temp, journalFile);
}
async function api(route, method = 'GET', body) {
  const res = await fetch(new URL(route, base), {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  const data = await res.json();
  if (!res.ok) { const error=new Error(data.error || 'Server HTTP ' + res.status); error.status=res.status; throw error; }
  return data;
}
async function listPrinters() {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Printer | Select-Object Name,DriverName,PortName,Default,WorkOffline | ConvertTo-Json -Compress'], { timeout: 15000, windowsHide: true });
  const result = stdout.trim() ? JSON.parse(stdout) : [];
  return (Array.isArray(result) ? result : [result]).map(p => ({ ...p, PrinterStatus: p.WorkOffline ? 'offline' : 'idle' }));
}

async function setJob(job,status,details={}){return api('/api/agent/jobs','PUT',{id:job.id,claimToken:job.claimToken,status,...details});}
function save(entry){journal[entry.id]=entry;persist();}
async function recover(){await runner.recover(journal,{report:setJob,save});}
async function printJob(candidate,config){
 const {order:job}=await api('/api/agent/jobs','POST',{id:candidate.id,agentId,capabilities:['multi-document-v1']});
 const spools=[];
 try{await runner.execute(job,{
  save,report:setJob,
  prepare:async()=>{
   const all=job.documents?.length?job.documents:[{...job,id:'legacy'}];
   const documents=job.printDocumentIds?all.filter(d=>job.printDocumentIds.includes(d.id)):all;
   if(!documents.length)throw Error('No documents selected for this attempt.');
   const plan=[];
   for(const [index,document] of documents.entries()){
    const spool=path.join(stateDir,job.id+'-'+index+'.pdf');spools.push(spool);
    const url=new URL(document.fileUrl,base);
    if(url.origin!==base.origin||!/^\/api\/file\/[0-9a-f-]{36}$/.test(url.pathname))throw Error('Invalid document source.');
    const res=await fetch(url,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!res.ok)throw Error('Document download failed: HTTP '+res.status);
    const bytes=Buffer.from(await res.arrayBuffer());
    if(bytes.length>50*1024*1024)throw Error('PDF exceeds download limit.');
    const pdf=await require('pdf-lib').PDFDocument.load(bytes);
    if(pdf.getPageCount()!==document.pages)throw Error('Downloaded PDF page count does not match the job.');
    fs.writeFileSync(spool,bytes);
    const selected=config.printers.find(p=>p.id===job.assignedPrinterId)||config.printers.find(p=>document.colorMode==='color'?p.isDefaultColor:p.isDefaultBW)||config.printers.find(p=>p.isDefault);
    if(!selected||!printers.some(p=>p.Name===selected.name&&p.PrinterStatus!=='offline'))throw Error('Configured printer is disconnected or unavailable.');
    if(document.colorMode==='color'&&!selected.supportsColor)throw Error('Printer does not support color.');
    if(document.duplex==='duplex'&&selected.supportsDuplex===false)throw Error('Confirm duplex capability before printing.');
    if(document.paperSize==='A3'&&!selected.supportsA3)throw Error('Printer does not support A3.');
    if(/pdf|onenote|xps|fax/i.test(selected.name))throw Error('Select a physical printer.');
    if(!fs.existsSync(sumatra))throw Error('SumatraPDF is missing.');
    plan.push({document,spool,selected});
   }return plan;
  },
  submit:async({document,spool,selected})=>{
   const settings=[document.copies+'x',document.duplex==='duplex'?'duplexlong':'simplex',document.colorMode==='color'?'color':'monochrome','paper='+document.paperSize,'fit'];
   if(document.orientation==='landscape')settings.push('landscape');
   await run(sumatra,['-print-to',selected.name,'-silent','-print-settings',settings.join(','),spool],{windowsHide:true,timeout:120000});
  }
 });}finally{for(const spool of spools)if(fs.existsSync(spool))fs.unlinkSync(spool);}
}
async function poll() {
  if (busy) return;
  busy = true;
  try {
    await recover();
    printers = await listPrinters();
    await api('/api/config', 'POST', { lastAgentPing: true, agentVersion: '3.0.0', pcName: agentId, osVersion: os.release(), printers });
    const config = await api('/api/config');
    if (!config.autoPrintEnabled) return;
    const { orders } = await api('/api/orders?agent=true');
    const candidate = orders.find(o => !journal[o.id] || journal[o.id].claimToken !== o.claimToken && journal[o.id].phase === 'acknowledged');
    if (candidate) await printJob(candidate, config);
  } catch (error) { console.error(new Date().toISOString(), error.message); }
  finally { busy = false; }
}
// Binding loopback also prevents a second agent instance on this PC.
const server = http.createServer((req, res) => {
  if (req.url !== '/status') { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ agentStatus: 'Online', pcName: agentId, printers, busy }));
});
server.on('error', error => { console.error('Agent already running or port unavailable:', error.message); process.exitCode = 1; });
server.listen(Number(process.env.AGENT_STATUS_PORT || 4000), '127.0.0.1', () => {
  console.log('Print agent connected to', base.origin); void poll(); setInterval(poll, 5000);
  // Keep the counter connection visible during a long-running spool process.
  setInterval(() => {
    if (busy) void api('/api/config', 'POST', { lastAgentPing: true, agentVersion: '3.0.0', pcName: agentId, osVersion: os.release(), printers }).catch(error => console.error('Heartbeat:', error.message));
  }, 5000);
});
