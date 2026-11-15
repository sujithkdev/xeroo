const fs = require('node:fs');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const root = path.resolve(__dirname, '..');
process.chdir(root);
async function main() {
  const app = '.counter-stage/app';
  const server = '.counter-stage/server';
  fs.rmSync('.counter-stage', {recursive:true, force:true});
  fs.mkdirSync(app + '/electron', {recursive:true});
  for (const file of ['print-agent.js','agent','electron/counter-main.cjs']) {
    fs.cpSync(file, path.join(app,file), {recursive:true});
  }
  fs.cpSync('.desktop-app/node_modules',app+'/node_modules',{recursive:true});
  const pkg = require('../.desktop-app/package.json');
  Object.assign(pkg,{name:'xeroo-counter',main:'electron/counter-main.cjs',description:'Single shop desktop counter'});
  fs.writeFileSync(app+'/package.json',JSON.stringify(pkg));
  const source = '.counter-build/standalone/';
  for (const file of ['server.js','package.json','node_modules','.counter-build']) {
    fs.cpSync(source+file, path.join(server,file), {recursive:true,dereference:true, filter:p=>!path.basename(p).startsWith('.env')});
  }
  fs.cpSync('.counter-build/static',server+'/.counter-build/static',{recursive:true});
  for (const folder of ['images','vendor']) fs.cpSync('public/'+folder,server+'/public/'+folder,{recursive:true});
  await build({targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),config:'electron/counter-builder.cjs'});
}
main().catch(error=>{console.error(error);process.exitCode=1;});

