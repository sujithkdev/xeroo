const {spawn}=require('child_process');
const path=require('path');
let closing=false;
const server=spawn(process.execPath,['--env-file-if-exists=.env.local','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1'],{cwd:path.resolve('.'),windowsHide:true,stdio:'inherit'});
let agent;
async function boot(){for(let i=0;i<60;i++){if(server.exitCode!==null)return;try{if((await fetch('http://127.0.0.1:3000/api/config')).ok){agent=spawn(process.execPath,['--env-file-if-exists=.env.local','print-agent.js'],{windowsHide:true,stdio:'inherit'});console.log('Open http://127.0.0.1:3000/shop');return;}}catch{}await new Promise(r=>setTimeout(r,500));}console.error('Server startup timed out');close();}
function close(){if(closing)return;closing=true;agent?.kill();server.kill();}
process.on('SIGINT',close);process.on('SIGTERM',close);server.on('exit',()=>{agent?.kill();});void boot();
