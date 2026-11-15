'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {eligibleDocument}=require('./document-retention.cjs');
const apply=process.argv.includes('--apply');
const dir=path.resolve(process.env.DATA_DIR||'data');
function localTarget(root,name){
 const target=path.resolve(root,name);
 if(path.dirname(target)!==path.resolve(root))throw Error('Unsafe document path.');
 return target;
}
function removeFile(file){try{fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
function describe(id){console.log((apply?'Removing ':'Eligible ')+id);}
async function localCleanup(){
 const {DatabaseSync}=require('node:sqlite');
 const sql=new DatabaseSync(path.join(dir,'print-hub.sqlite'),{readOnly:true});
 let state;try{state=JSON.parse(sql.prepare('SELECT value FROM state WHERE id=1').get().value);}finally{sql.close();}
 const days=Number(process.env.RETENTION_DAYS||state.shopSettings?.retentionDays||30);
 if(!Number.isInteger(days)||days<1)throw Error('Retention days must be a positive integer.');
 const documents=path.join(dir,'documents');if(!fs.existsSync(documents))return;
 for(const name of fs.readdirSync(documents)){
  if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;
  const meta=JSON.parse(fs.readFileSync(path.join(documents,name),'utf8'));
  if(meta.id!==name.slice(0,-5))throw Error('Document metadata ID mismatch.');
  const related=(state.orders||[]).filter(o=>o.fileUrl==='/api/file/'+meta.id||o.documents?.some(d=>d.fileUrl==='/api/file/'+meta.id));
  if(!eligibleDocument(meta,related,state.checkoutQuotes||[],days))continue;
  describe(meta.id);
  if(apply){removeFile(localTarget(documents,meta.id+'.pdf'));removeFile(localTarget(documents,name));}
 }
}
async function cloudCleanup(){
 const {Client}=require('pg');
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 const bucket=process.env.STORAGE_BUCKET;
 let s3,DeleteObjectCommand;
 if(bucket){const sdk=require('@aws-sdk/client-s3');DeleteObjectCommand=sdk.DeleteObjectCommand;s3=new sdk.S3Client({region:process.env.STORAGE_REGION||'ap-south-1',credentials:{accessKeyId:process.env.STORAGE_ACCESS_KEY||'',secretAccessKey:process.env.STORAGE_SECRET_KEY||''},...(process.env.STORAGE_ENDPOINT?{endpoint:process.env.STORAGE_ENDPOINT,forcePathStyle:true}:{})});}
 try{
  const shops=(await client.query('SELECT s.id,COALESCE(c.retention_days,7) AS days FROM shops s LEFT JOIN shop_settings c ON c.shop_id=s.id')).rows;
  for(const shop of shops){
   const docs=(await client.query('SELECT * FROM documents WHERE shop_id=$1 AND deleted_at IS NULL',[shop.id])).rows;
   const orders=(await client.query('SELECT * FROM orders WHERE shop_id=$1',[shop.id])).rows;
   const items=(await client.query('SELECT document_id,order_id FROM order_items WHERE shop_id=$1',[shop.id])).rows;
   const quotes=(await client.query('SELECT quotes FROM checkout_state WHERE shop_id=$1',[shop.id])).rows[0]?.quotes||[];
   for(const doc of docs){
    const linked=new Set(items.filter(i=>i.document_id===doc.id).map(i=>i.order_id));if(doc.order_id)linked.add(doc.order_id);
    const related=orders.filter(o=>linked.has(o.id)).map(o=>({...o.checkout_payload,status:o.order_status,isPaid:o.payment_status==='paid',refundState:o.refund_state||o.checkout_payload?.refundState,createdAt:o.created_at.toISOString(),updatedAt:o.updated_at.toISOString()}));
    if(!eligibleDocument({id:doc.id,createdAt:doc.uploaded_at.toISOString(),expiresAt:doc.expires_at?.toISOString()},related,quotes,Number(shop.days)))continue;
    // Generated storage keys are shop-scoped; never delete an arbitrary path from metadata.
    if(doc.storage_key!==`documents/${shop.id}/${doc.id}.pdf`)throw Error('Unexpected document storage key: '+doc.id);
    describe(doc.id);if(!apply)continue;
    if(bucket)await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:doc.storage_key}));
    else removeFile(localTarget(path.join(dir,'storage'),doc.storage_key.replace(/\//g,'__')));
    // Preserve metadata and order foreign keys. A failed delete is never marked complete.
    await client.query('UPDATE documents SET deleted_at=now() WHERE id=$1 AND shop_id=$2',[doc.id,shop.id]);
   }
  }
 }finally{await client.end();s3?.destroy();}
}
async function main(){
 // Offline maintenance prevents checkout from acquiring a reference between inspection and deletion.
 if(apply&&!process.argv.includes('--server-stopped'))throw Error('Stop all application servers and print agents, then pass --apply --server-stopped. Preview is safe while running.');
 if(process.env.DATABASE_URL)await cloudCleanup();else await localCleanup();
 console.log(apply?'Cleanup complete. Backups require separate retention.':'Preview only. Stop servers and agents before running with --apply --server-stopped.');
}
if(require.main===module)main().catch(e=>{console.error('Cleanup failed:',e.message);process.exitCode=1;});
