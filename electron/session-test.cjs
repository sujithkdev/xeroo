// Isolated automated test entry point, never used by the shipped application.
const {app,session,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
app.setPath('userData',path.join(path.dirname(process.argv[2]),'session-profile'));
app.whenReady().then(async()=>{
 const ses=session.fromPartition('xeroo-integration');
 const login=await ses.fetch(fixture.origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:fixture.origin},body:JSON.stringify({email:fixture.email,password:fixture.password})});
 const devices=await ses.fetch(fixture.origin+'/api/devices');
 const data=await devices.json();
 const win=new BrowserWindow({show:false,width:1200,height:1000,webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await win.loadURL(fixture.origin+'/shop/setup');
 let ready=false;
 for(let i=0;i<50;i++){
  ready=await win.webContents.executeJavaScript("document.body.innerText.includes('Physical Test Printer')");
  if(ready&&await win.webContents.executeJavaScript("Array.from(document.images).some(i=>i.src.includes('/api/customer-qr')&&i.complete&&i.naturalWidth>0)"))break;await new Promise(r=>setTimeout(r,100));
 }
 const qr=await win.webContents.executeJavaScript("Array.from(document.images).some(i=>i.src.includes('/api/customer-qr')&&i.complete&&i.naturalWidth>0)");
 fs.writeFileSync(path.join(path.dirname(fixture.result),'shop-setup.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(fixture.result,JSON.stringify({login:login.status,devices:devices.status,deviceCount:data.devices?.length,setupRendered:ready,qrLoaded:qr}));
 app.quit();
}).catch(e=>{fs.writeFileSync(fixture.result,JSON.stringify({error:e.message}));app.exit(1);});
