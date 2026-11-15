import { PDFDocument, PDFInvalidObject, PDFName } from 'pdf-lib';

export async function unlockDocumentBytes(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes, { password });
  // A full rewrite must discard old index streams. Cantoo 2.11.1 can parse an
  // unencrypted XRef stream as PDFInvalidObject during AES decryption; retaining
  // it resurrects the original /Encrypt entry on the next load.
  for (const [reference, object] of document.context.enumerateIndirectObjects()) {
    if (object instanceof PDFInvalidObject) {
      const raw = new Uint8Array(object.sizeInBytes()); object.copyBytesInto(raw, 0);
      if (/\/Type\s*\/XRef\b/.test(new TextDecoder('latin1').decode(raw))) document.context.delete(reference);
      else throw new Error('The PDF contains an unreadable object. Repair it before unlocking.');
    } else {
      const type = (object as any).dict?.get(PDFName.of('Type'))?.toString();
      if (type === '/XRef' || type === '/ObjStm') document.context.delete(reference);
    }
  }
  const result = await document.save({ rewrite: true });
  // Verify the saved file opens without a password and retains every page.
  const verified = await PDFDocument.load(result);
  if (verified.getPageCount() !== document.getPageCount()) throw new Error('Unlocked page count mismatch');
  return result;
}
