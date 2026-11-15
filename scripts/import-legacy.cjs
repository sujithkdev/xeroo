// Non-destructive import: the original db.json and documents remain untouched.
const fs=require('fs');const path=require('path');const ts=require('typescript');const {DatabaseSync}=require('node:sqlite');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const defaults=require('../src/lib/mockData.ts');
const dir=path.resolve(process.env.DATA_DIR||'data');fs.mkdirSync(dir,{recursive:true});
if(!fs.existsSync('db.json'))throw new Error('No legacy db.json to import.');
const legacy=JSON.parse(fs.readFileSync('db.json','utf8'));
if(!Array.isArray(legacy.orders))throw new Error('Legacy database has no orders array.');
const sql=new DatabaseSync(path.join(dir,'print-hub.sqlite'));
sql.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);BEGIN IMMEDIATE;');
try{
 if(sql.prepare('SELECT id FROM state WHERE id=1').get())throw new Error('Destination already initialized. Refusing to replace current data.');
 const state={...legacy,shopSettings:{...defaults.mockShopSettings,...legacy.shopSettings},pricingConfig:{...defaults.mockPricing,...legacy.pricingConfig},printRules:{...defaults.mockRules,...legacy.printRules,allowedFileTypes:['pdf'],maxUploadSizeMB:Math.min(50,legacy.printRules?.maxUploadSizeMB||50)},razorpayConfig:{...defaults.mockRazorpayConfig,...legacy.razorpayConfig},whatsappConfig:{...defaults.mockWhatsAppConfig,...legacy.whatsappConfig},lastAgentPing:'',printers:[],autoPrintEnabled:false};
 state.orders=legacy.orders.map(o=>({...o,status:['paid','queued','printing','downloading','cancel_requested'].includes(o.status)?'error':o.status,claimToken:undefined,claimedBy:undefined,legacyImported:true}));
 sql.prepare('INSERT INTO state(id,value) VALUES(1,?)').run(JSON.stringify(state));sql.exec('COMMIT');
 console.log('Imported '+state.orders.length+' historical orders. Queue paused; review legacy documents before reprinting. Original db.json preserved.');
}catch(error){sql.exec('ROLLBACK');throw error;}finally{sql.close();}
