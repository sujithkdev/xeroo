'use strict';
const pilotOrigin = 'https://refer-through-magnet-lanka.trycloudflare.com';
function shopOrigin(input,{development=false}={}){
 if(typeof input!=='string'||input.length>250)throw Error('Enter your shop address.');
 const url=new URL(input.includes('://')?input:'https://'+input.trim());
 if(url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw Error('Enter only the shop address, without a path or credentials.');
 const match=/^([a-z0-9][a-z0-9-]{1,61}[a-z0-9])\.techpickhub\.shop$/.exec(url.hostname);
 const reserved=['admin','api','www','support','app','mail','test','staging','dev','status','static'];
 const local=development&&/^[a-z0-9-]+\.print\.localhost$/.test(url.hostname)&&url.protocol==='http:';
 if(url.origin===pilotOrigin)return pilotOrigin;
 if(!local&&(!match||reserved.includes(match[1])||url.protocol!=='https:'||url.port))throw Error('Use your assigned HTTPS shop address, such as krishna.techpickhub.shop.');
 return url.origin;
}
module.exports={shopOrigin,pilotOrigin};
