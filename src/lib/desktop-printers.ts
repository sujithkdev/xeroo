import {withTransaction,queryOne} from './db/client';
export async function recordPrinterInventory(shopId:string,agentId:string,input:unknown){
 if(!Array.isArray(input)||input.length>100)throw Error('Invalid printer inventory.');
 const inventory=input.map(p=>{
  if(!p||typeof p.Name!=='string'||!p.Name.trim()||p.Name.length>200)throw Error('Invalid printer name.');
  return {Name:p.Name,DriverName:String(p.DriverName||'').slice(0,200),WorkOffline:!!p.WorkOffline};
 });
 await withTransaction(async c=>{
  await c.query('SELECT id FROM shops WHERE id=$1 FOR UPDATE',[shopId]);
  const active=await c.query('SELECT id FROM agents WHERE id=$1 AND shop_id=$2 AND NOT is_revoked FOR UPDATE',[agentId,shopId]);
  if(!active.rowCount)throw Error('Computer revoked.');
  await c.query('UPDATE agents SET detected_printers=$2 WHERE id=$1',[agentId,JSON.stringify(inventory)]);
  for(const p of inventory){
   if(/pdf|onenote|xps|fax/i.test(p.Name))continue;
   if(!(await c.query('SELECT id FROM printers WHERE shop_id=$1 AND name=$2',[shopId,p.Name])).rowCount)
    await c.query('INSERT INTO printers(shop_id,name,model,supports_duplex) VALUES($1,$2,$3,false)',[shopId,p.Name,p.DriverName]);
  }
 });
}
export async function printerHeartbeat(shopId:string){
 return queryOne<{last_seen_at:Date|null;detected_printers:{Name:string;WorkOffline:boolean}[]}>('SELECT last_seen_at,detected_printers FROM agents WHERE shop_id=$1 AND NOT is_revoked ORDER BY last_seen_at DESC NULLS LAST LIMIT 1',[shopId]);
}
export async function savePrinterCapabilities(shopId:string,input:unknown){
 if(!Array.isArray(input)||input.length>100)throw Error('Invalid printers.');
 if(input.filter(p=>p.isDefaultBW).length>1||input.filter(p=>p.isDefaultColor).length>1)throw Error('Choose one default per print mode.');
 await withTransaction(async c=>{
  await c.query('SELECT id FROM shops WHERE id=$1 FOR UPDATE',[shopId]);
  if(input.some(p=>p.isDefaultBW))await c.query('UPDATE printers SET is_default_bw=false WHERE shop_id=$1',[shopId]);
  if(input.some(p=>p.isDefaultColor))await c.query('UPDATE printers SET is_default_color=false WHERE shop_id=$1',[shopId]);
  for(const p of input){
   if(!p||typeof p.id!=='string'||!/^[0-9a-f-]{36}$/.test(p.id))throw Error('Use a detected Windows printer.');
   for(const key of ['supportsColor','supportsA3','supportsDuplex','isDefaultBW','isDefaultColor'])if(p[key]!==undefined&&typeof p[key]!=='boolean')throw Error('Invalid printer capabilities.');
   if(p.isDefaultColor&&!p.supportsColor)throw Error('The colour default must support colour.');
   const result=await c.query('UPDATE printers SET supports_color=$3,supports_a3=$4,supports_duplex=$5,is_default_bw=$6,is_default_color=$7,updated_at=now() WHERE id=$1 AND shop_id=$2 RETURNING id',[p.id,shopId,!!p.supportsColor,!!p.supportsA3,!!p.supportsDuplex,!!p.isDefaultBW,!!p.isDefaultColor]);
   if(!result.rowCount)throw Error('Printer does not belong to this shop.');
  }
 });
}
