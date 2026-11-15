import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
export const documentDirectory=()=>path.resolve(process.env.DATA_DIR||'data','documents');
export async function storeDocument(bytes:Uint8Array,fileName:string,maxMB:number,maxPages:number){
 if(!bytes.length||bytes.length>Math.min(maxMB,50)*1024*1024)throw Error('PDF exceeds the upload limit.');
 let pdf;try{pdf=await PDFDocument.load(bytes,{ignoreEncryption:false});}catch{throw Error('Cannot read this PDF. Unlock or repair it before uploading.');}
 const pages=pdf.getPageCount();if(!pages||pages>maxPages)throw Error('Document exceeds the page limit.');
 const id=crypto.randomUUID();const doc={id,createdAt:new Date().toISOString(),fileName:fileName.slice(0,255),pages,size:bytes.length/1024/1024,fileUrl:`/api/file/${id}`};
 fs.mkdirSync(documentDirectory(),{recursive:true});fs.writeFileSync(path.join(documentDirectory(),id+'.pdf'),bytes);fs.writeFileSync(path.join(documentDirectory(),id+'.json'),JSON.stringify(doc));return doc;
}
export function documentMetadata(url:string){const id=/^\/api\/file\/([0-9a-f-]{36})$/.exec(url||'')?.[1];if(!id)throw Error('Upload a PDF before ordering.');try{fs.accessSync(path.join(documentDirectory(),id+'.pdf'));return JSON.parse(fs.readFileSync(path.join(documentDirectory(),id+'.json'),'utf8'));}catch{throw Error('Document is unavailable. Please upload again.');}}
