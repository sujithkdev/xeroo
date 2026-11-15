/**
 * Document management — validates PDFs, stores to object storage, saves metadata to DB.
 * Replaces the original filesystem-only implementation.
 * The local filesystem fallback in storage.ts keeps dev working without S3.
 */
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { uploadObject, deleteObject, documentKey, checksum as computeChecksum } from './storage';
import { query, queryOne } from './db/client';

export interface StoredDocument {
  id: string;
  shopId: string;
  storageKey: string;
  fileName: string;
  pages: number;
  sizeBytes: number;
  checksum: string;
  fileUrl: string;          // internal route: /api/file/<id>
}

/**
 * Validate a PDF, upload to object storage and record metadata in the DB.
 * Never trusts client-supplied page count — counted server-side.
 */
export async function storeDocument(
  bytes: Uint8Array,
  originalName: string,
  shopId: string,
  limits: { maxMB: number; maxPages: number }
): Promise<StoredDocument> {
  // 1. Size check
  const maxBytes = Math.min(limits.maxMB, 50) * 1024 * 1024;
  if (!bytes.length || bytes.length > maxBytes) {
    throw new Error(`Document is empty or exceeds the ${limits.maxMB} MB upload limit.`);
  }

  // 2. PDF validity + page count (server-side — client cannot forge this)
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new Error('Cannot read this PDF. Unlock or repair it before uploading.');
  }
  const pages = pdf.getPageCount();
  if (!pages || pages > limits.maxPages) {
    throw new Error(`Document has ${pages} pages, which exceeds the ${limits.maxPages}-page limit.`);
  }

  // 3. Generate ID and storage key
  const id = crypto.randomUUID();
  const key = documentKey(shopId, id);
  const hash = computeChecksum(Buffer.from(bytes));
  const fileName = originalName.replace(/[^a-zA-Z0-9._\- ]/g, '').slice(0, 255) || 'document.pdf';

  // 4. Upload to object storage (or local fallback)
  await uploadObject(key, bytes, 'application/pdf');

  // 5. Record in DB
  try { await query(
    `INSERT INTO documents
       (id, shop_id, storage_key, file_name, pages, size_bytes, checksum, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + COALESCE((SELECT retention_days FROM shop_settings WHERE shop_id=$2),7) * interval '1 day')`,
    [id, shopId, key, fileName, pages, bytes.length, hash]
  ); } catch(error) {
    // A failed metadata insert must not leave an untracked billable object.
    try { await deleteObject(key); } catch { console.error('Failed to remove orphaned upload:', key); }
    throw error;
  }

  return {
    id,
    shopId,
    storageKey: key,
    fileName,
    pages,
    sizeBytes: bytes.length,
    checksum: hash,
    fileUrl: `/api/file/${id}`,
  };
}

/** Load document metadata from DB, enforcing shop isolation. */
export async function getDocumentMetadata(
  docId: string,
  shopId: string
): Promise<StoredDocument> {
  const row = await queryOne<{
    id: string; shop_id: string; storage_key: string; file_name: string;
    pages: number; size_bytes: number; checksum: string;
  }>(
    'SELECT * FROM documents WHERE id = $1 AND shop_id = $2 AND deleted_at IS NULL',
    [docId, shopId]
  );
  if (!row) throw new Error('Document not found or access denied.');
  return {
    id: row.id,
    shopId: row.shop_id,
    storageKey: row.storage_key,
    fileName: row.file_name,
    pages: row.pages,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    fileUrl: `/api/file/${row.id}`,
  };
}

/** Parse /api/file/<uuid> → docId, or throw. */
export function parseFileUrl(url: string): string {
  const match = /^\/api\/file\/([0-9a-f-]{36})$/.exec(url ?? '');
  if (!match) throw new Error('Upload a PDF before placing the order.');
  return match[1];
}

/** Mark a document as linked to an order (sets expiry from retention policy). */
export async function linkDocumentToOrder(
  docId: string,
  shopId: string,
  orderId: string,
  retentionDays: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + retentionDays * 86_400_000).toISOString();
  await query(
    `UPDATE documents
     SET order_id = $1, expires_at = $2
     WHERE id = $3 AND shop_id = $4`,
    [orderId, expiresAt, docId, shopId]
  );
}
