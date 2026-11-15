'use strict';
const {app,BrowserWindow,Menu,ipcMain,dialog,safeStorage,utilityProcess,shell,powerMonitor}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {shopOrigin,pilotOrigin}=require('./connection.cjs');
let locking=false;
let window,setup,profile={},agent,closing=false,restartTimer;
const smoke=process.argv.includes('--smoke-test');
if(smoke)app.setPath('userData',path.resolve('.test-data','electron-smoke'));
const root=app.getPath('userData'),configPath=path.join(root,'connection.json'),logPath=path.join(root,'agent.log');
const runtimeRoot=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked'):path.join(__dirname,'..');
const setupPath=path.join(__dirname,'connect.html'),setupUrl=pathToFileURL(setupPath).href;
fs.mkdirSync(root,{recursive:true});
function log(message){if(fs.existsSync(logPath)&&fs.statSync(logPath).size>5*1024*1024)fs.renameSync(logPath,logPath+'.previous');fs.appendFileSync(logPath,new Date().toISOString()+' '+String(message)+'\n');}
function save(){const tmp=configPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(profile),{mode:0o600});fs.renameSync(tmp,configPath);}
function stopAgent(){clearTimeout(restartTimer);const old=agent;agent=null;old?.kill();}
async function startAgent(){
 if(agent||!profile.credential||closing||smoke)return;
 const token=(await safeStorage.decryptStringAsync(Buffer.from(profile.credential,'base64'))).result;
 const env={};for(const key of ['SystemRoot','SYSTEMROOT','WINDIR','PATH','Path','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
 Object.assign(env,{BACKEND_URL:profile.origin,AGENT_TOKEN:token,AGENT_ID:profile.deviceId,AGENT_DATA_DIR:path.join(root,'jobs',profile.deviceId),SUMATRA_PATH:app.isPackaged?path.join(process.resourcesPath,'SumatraPDF.exe'):path.join(__dirname,'..','SumatraPDF.exe'),AGENT_STATUS_PORT:'0'});
 const child=utilityProcess.fork(path.join(runtimeRoot,'print-agent.js'),[],{env,stdio:'pipe',serviceName:'Xeroo printing'});agent=child;
 child.stdout?.on('data',d=>log(d.toString()));child.stderr?.on('data',d=>log(d.toString()));
 child.on('exit',code=>{if(agent!==child)return;agent=null;log('Print agent exited: '+code);if(!closing)restartTimer=setTimeout(()=>startAgent().catch(e=>log(e.message)),5000);});
}
function secure(win,origin){
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-attach-webview',e=>e.preventDefault());
 win.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==origin)e.preventDefault();});
 win.webContents.on('will-redirect',(e,url)=>{if(new URL(url).origin!==origin)e.preventDefault();});
 win.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
 win.webContents.session.setPermissionCheckHandler(()=>false);
}
async function dashboard(){
 if(window&&!window.isDestroyed()){window.focus();return;}
 window=new BrowserWindow({icon:path.join(__dirname,'xeroo-desk.ico'),width:1280,height:850,minWidth:900,minHeight:650,title:'Xeroo Desk',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,partition:'persist:xeroo-shop'}});
 secure(window,profile.origin);
 window.on('closed',()=>{window=null;});
 window.webContents.on('did-fail-load',(_e,code)=>{if(code!==-3)log('Dashboard connection failed: '+code);});
 try{await window.loadURL(profile.origin+'/shop/login');}catch{dialog.showErrorBox('Shop connection unavailable','Check your internet connection and shop address. Use Shop → Reload dashboard to retry.');}
 await startAgent();
}
async function lockCounter() {
 const current = window;
 if (locking || !current || current.isDestroyed()) return;
 locking = true;
 const browserSession = current.webContents.session;
 const origin = profile.origin;
 current.destroy();
 window = null;
 try {
   await browserSession.fetch(origin + '/api/auth/logout', {
     method: 'POST', redirect: 'error', headers: { Origin: origin },
     signal: AbortSignal.timeout(4000)
   });
 } catch { log('Counter locked while server was unreachable.'); }
 finally {
   await browserSession.clearStorageData({origin});
   locking = false;
   if (!closing) await dashboard();
 }
}
async function register(){
 if(!window||!profile.origin)throw Error('Connect to your shop and sign in first.');
 if(profile.credential){await startAgent();await window.loadURL(profile.origin+'/shop/setup');return;}
 if(!await safeStorage.isAsyncEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');
 const encryptedReady=await safeStorage.encryptStringAsync('storage-check');await safeStorage.decryptStringAsync(encryptedReady);
 const response=await window.webContents.session.fetch(profile.origin+'/api/devices',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Origin:profile.origin},body:JSON.stringify({label:os.hostname()})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Registration failed');
 profile.deviceId=data.device.id;profile.credential=(await safeStorage.encryptStringAsync(data.token)).toString('base64');save();
 await startAgent();await window.loadURL(profile.origin+'/shop/setup');
}
function showSetup(){
 if(setup&&!setup.isDestroyed()){setup.focus();return;}
 setup=new BrowserWindow({icon:path.join(__dirname,'xeroo-desk.ico'),width:580,height:530,resizable:false,title:'Connect Xeroo Desk',webPreferences:{preload:path.join(__dirname,'connect-preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 secure(setup,'null');setup.loadFile(setupPath);setup.on('closed',()=>{setup=null;});
}
async function disconnect(){
 const answer=await dialog.showMessageBox({type:'warning',buttons:['Cancel','Disconnect'],defaultId:0,cancelId:0,message:'Disconnect this shop?',detail:'Pause the queue and check physical output first. This revokes this computer online, signs out locally, and preserves its recovery journal.'});
 if(answer.response!==1)return;
 if(profile.deviceId){
  if(!window)throw Error('Open the dashboard and sign in as owner before disconnecting.');
  const r=await window.webContents.session.fetch(profile.origin+'/api/devices',{method:'DELETE',redirect:'error',headers:{'Content-Type':'application/json',Origin:profile.origin},body:JSON.stringify({id:profile.deviceId})});
  if(!r.ok)throw Error('Sign in as the shop owner and retry disconnecting.');
 }
 stopAgent();if(window){await window.webContents.session.clearStorageData();window.destroy();window=null;}profile={};save();showSetup();
}
function handle(fn){return ()=>Promise.resolve().then(fn).catch(e=>dialog.showErrorBox('Xeroo Desk',e.message));}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{(window||setup)?.show();(window||setup)?.focus();});
 app.whenReady().then(async()=>{
  if(fs.existsSync(configPath))profile=JSON.parse(fs.readFileSync(configPath,'utf8'));
  if (!profile.credential && ['https://krishna.techpickhub.shop','http://krishna.print.localhost:3017'].includes(profile.origin)) {profile.origin=pilotOrigin;save();}
  if(profile.origin)profile.origin=shopOrigin(profile.origin,{development:!app.isPackaged});
  ipcMain.handle('xeroo:connect',async(event,input)=>{
   if(event.sender!==setup?.webContents||event.senderFrame?.url!==setupUrl)throw Error('Invalid setup context.');
   if(profile.credential)throw Error('Disconnect the current shop first.');
   const origin=shopOrigin(input,{development:!app.isPackaged});
   if(window && profile.origin!==origin){await window.webContents.session.clearStorageData();window.destroy();window=null;}
   profile={origin};save();await dashboard();setup?.close();return true;
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Shop',submenu:[{label:'Platform admin login',click:handle(async()=>{
    const origin=app.isPackaged?'https://admin.techpickhub.shop':'http://admin.print.localhost:3017';
    const admin=new BrowserWindow({icon:path.join(__dirname,'xeroo-desk.ico'),width:1280,height:850,webPreferences:{partition:'xeroo-admin',sandbox:true,contextIsolation:true,nodeIntegration:false}});
    secure(admin,origin);
    await admin.loadURL(origin+'/admin/login');
  })},{label:'Lock counter',click:handle(lockCounter)},{label:'Connect to shop',click:showSetup},{label:'Register this computer',click:handle(register)},{label:'Computer & printer setup',click:handle(()=>window?.loadURL(profile.origin+'/shop/setup'))},{label:'Reload dashboard',click:handle(()=>window?window.loadURL(profile.origin+'/shop'):dashboard())},{label:'Disconnect shop',click:handle(disconnect)},{type:'separator'},{label:'View print-agent logs',click:()=>shell.showItemInFolder(logPath)},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'}]));
  powerMonitor.on('lock-screen',handle(lockCounter));
  const idleCheck = setInterval(() => {
    if (window && !window.isDestroyed() && !window.webContents.getURL().endsWith('/shop/login') && powerMonitor.getSystemIdleTime() >= 900) handle(lockCounter)();
  }, 30000);
  app.once('before-quit', () => clearInterval(idleCheck));
  if(smoke) showSetup();
  else {
    profile.origin ||= pilotOrigin;
    await dashboard();
  }
  if(smoke){
   if(setup.webContents.isLoading())await new Promise(resolve=>setup.webContents.once('did-finish-load',resolve));
   const sealed=await safeStorage.encryptStringAsync('xeroo-smoke');
   const result={electron:process.versions.electron,node:process.versions.node,setupLoaded:setup.webContents.getURL()===setupUrl,encryption:(await safeStorage.decryptStringAsync(sealed)).result==='xeroo-smoke'};
   const worker=utilityProcess.fork(path.join(runtimeRoot,'electron','smoke-agent.cjs'));
   result.worker=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.kill();reject(Error('Utility process timeout'));},20000);worker.once('message',data=>{clearTimeout(timer);resolve(data);worker.kill();});});
   fs.writeFileSync(path.resolve('.test-data','electron-smoke-result.json'),JSON.stringify(result,null,2));
   fs.writeFileSync(path.resolve('.test-data','electron-setup.png'),(await setup.webContents.capturePage()).toPNG());
   app.quit();
  }
 }).catch(e=>{dialog.showErrorBox('Xeroo Desk startup failed',e.message);app.quit();});
 app.on('window-all-closed',()=>{if(!locking)app.quit();});
 app.on('before-quit',()=>{closing=true;stopAgent();});
}
