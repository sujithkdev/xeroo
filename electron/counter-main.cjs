const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const smoke = process.argv.includes('--counter-smoke');
if (smoke) app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'xeroo-counter-check-')));
const data = app.getPath('userData');
const resources = process.resourcesPath;
const children = new Set();
let window, origin, closing = false;

async function availablePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

function launch(script, env) {
  const fd = fs.openSync(path.join(data, 'counter.log'), 'a');
  let child;
  try {
    child = spawn(path.join(resources, 'node.exe'), [script], {
      cwd: path.dirname(script), env, windowsHide: true, stdio: ['ignore', fd, fd]
    });
  } finally { fs.closeSync(fd); }
  children.add(child);
  child.on('error', e => { if (!closing) dialog.showErrorBox('Counter startup', e.message); });
  child.on('exit', () => {
    children.delete(child);
    if (!closing) { dialog.showErrorBox('Xeroo Counter', 'A counter service stopped. Reopen the app and review any unfinished print jobs.'); app.quit(); }
  });
  return child;
}

async function start() {
  fs.mkdirSync(data,{recursive:true});
  const tokenFile=path.join(data,'agent.key');
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{flag:'wx'});
  const port=await availablePort();
  origin='http://127.0.0.1:'+port;
  const env={};
  for (const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','COMSPEC','PATHEXT'])
    if(process.env[key])env[key]=process.env[key];
  Object.assign(env,{NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),LOCAL_DB_MODE:'true',LOCAL_OPERATOR_MODE:'true',DATA_DIR:path.join(data,'data'),AGENT_DATA_DIR:path.join(data,'data','agent'),BACKEND_URL:origin,AGENT_TOKEN:fs.readFileSync(tokenFile,'utf8'),AGENT_STATUS_PORT:'0',SUMATRA_PATH:path.join(resources,'SumatraPDF.exe'),NEXT_TELEMETRY_DISABLED:'1'});
  const server=launch(path.join(resources,'server','server.js'),env);
  let ready=false;
  for(let n=0;n<120 && server.exitCode===null;n++){
    try { const res=await fetch(origin+'/api/config',{signal:AbortSignal.timeout(1000)}); if(res.ok && (await res.json()).shopSettings){ready=true;break;} } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!ready)throw Error('The local counter could not start. See '+path.join(data,'counter.log'));
  launch(path.join(resources,'app.asar.unpacked','print-agent.js'),env);
  window=new BrowserWindow({width:1280,height:850,title:'Xeroo Counter',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  for(const event of ['will-navigate','will-redirect'])window.webContents.on(event,(e,url)=>{if(new URL(url).origin!==origin)e.preventDefault();});
  const go=route=>()=>window.loadURL(origin+route);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Counter',submenu:[
    {label:'Dashboard',click:go('/shop')},{label:'New walk-in order',click:go('/shop/orders/new')},{label:'Orders',click:go('/shop/inbox')},{label:'Printers and test page',click:go('/shop/printers')},{label:'Shop settings',click:go('/shop/settings')},{label:'Show data folder',click:()=>shell.openPath(data)},{role:'quit'}
  ]},{role:'editMenu'},{role:'viewMenu'}]));
  await window.loadURL(origin+'/shop');
  if(smoke){
    const status={dashboard:window.webContents.getURL(),walkIn:(await fetch(origin+'/shop/orders/new')).status,printers:(await fetch(origin+'/shop/printers')).status,agentHeartbeat:false};
    for(let i=0;i<25;i++){
      const config=await (await fetch(origin+'/api/config')).json();
      if(config.lastAgentPing){status.agentHeartbeat=true;break;}
      await new Promise(r=>setTimeout(r,1000));
    }
    fs.writeFileSync(path.join(data,'smoke-result.json'),JSON.stringify(status));
    app.quit();
  }
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.whenReady().then(start).catch(e=>{dialog.showErrorBox('Xeroo Counter startup',e.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{closing=true;for(const child of children)child.kill();});
}
