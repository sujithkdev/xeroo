const {PDFDocument}=require('pdf-lib');
const {execFile}=require('node:child_process');
(async()=>{const doc=await PDFDocument.create();doc.addPage();const bytes=await doc.save();
 execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command','@(Get-CimInstance Win32_Printer).Count'],{windowsHide:true,timeout:15000},(error,stdout)=>{
  process.parentPort.postMessage({pdfBytes:bytes.length,printerDiscovery:!error,printerEntries:error?null:Number(stdout.trim()),node:process.versions.node});
 });
})().catch(e=>{process.parentPort.postMessage({error:e.message});});
