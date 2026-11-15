import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { storeDocument } from '@/lib/documents-local';
import { isLocalOperator,isLocalMode } from '@/lib/access';
import {getSessionWithShop} from '@/lib/auth/sessions';
import {requireManager,AuthError} from '@/lib/auth/permissions';
import {getPrinters,getShopSettings} from '@/lib/db/shops';
import {storeDocument as storeHostedDocument} from '@/lib/documents';
import {checkoutTransaction} from '@/lib/checkout-store';
export async function POST(request: Request) {
  try {
    let shopId:string|null=null;
    if(isLocalMode()){if(!isLocalOperator(request))throw new AuthError(401,'Unauthorized');}
    else {const session=await getSessionWithShop(request);requireManager(session);shopId=session.shopId;}
    const { printerId } = await request.json();
    const printer = (shopId?await getPrinters(shopId):await db.getPrinters()).find(p => p.id === printerId);
    if (!printer) throw new Error('Select a registered printer.');
    if(shopId&&!(await getShopSettings(shopId))?.auto_print_enabled)throw Error('Enable the print queue before queuing a test page.');
    const pdf = await PDFDocument.create(); const page = pdf.addPage(); const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText('Xeroo Desk - Printer Test', { x: 50, y: 750, size: 20, font });
    page.drawText('Confirm this page printed correctly at the counter.', { x: 50, y: 710, size: 12, font });
    page.drawText(new Date().toISOString(), { x: 50, y: 680, size: 10, font });
    const bytes=await pdf.save();
    if(shopId){
      const doc=await storeHostedDocument(bytes,'printer-test.pdf',shopId,{maxMB:1,maxPages:1});
      const id=crypto.randomUUID(),now=new Date().toISOString();
      const item={id:doc.id,fileUrl:doc.fileUrl,fileName:doc.fileName,pages:1,copies:1,paperSize:'A4',colorMode:'bw',duplex:'simplex',orientation:'portrait',finishing:'none',itemAmountPaise:0};
      await checkoutTransaction(shopId,async state=>{state.orders.push({...item,id,documents:[item],trackingToken:crypto.randomBytes(32).toString('hex'),pickupCode:crypto.randomBytes(4).toString('hex'),customerName:'Printer test',customerPhone:'0000000000',amount:0,amountPaise:0,isPaid:true,paymentMethod:'cash',status:'queued',source:'counter',synthetic:true,assignedPrinterId:printerId,createdAt:now,updatedAt:now});});
      return NextResponse.json({success:true,id});
    }
    const document = await storeDocument(bytes, 'printer-test.pdf', 1, 1);
    const id = 'KP-' + crypto.randomUUID();
    await db.saveOrder({ id, customerName: 'Printer test', customerPhone: '0000000000', fileUrl: document.fileUrl, fileName: 'printer-test.pdf', fileSize: document.size / 1048576, pages: 1, copies: 1, paperSize: 'A4', colorMode: 'bw', duplex: 'simplex', orientation: 'portrait', amount: 0, isPaid: true, paymentId: 'operator-test:' + id, paymentMethod: 'cash', status: 'queued', source: 'web', assignedPrinterId: printerId, pickupCode: 'TEST', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return NextResponse.json({ success: true, id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Test failed' }, { status: error instanceof AuthError?error.status:400 }); }
}

