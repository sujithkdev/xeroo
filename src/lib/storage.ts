/**
 * Object storage adapter — S3-compatible (AWS S3, Cloudflare R2, MinIO).
 * Falls back to local filesystem when STORAGE_BUCKET is not set (dev mode).
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ─── Client singleton ────────────────────────────────────────────────────────
let _s3: S3Client | null = null;

function getS3(): S3Client {
  if (_s3) return _s3;
  _s3 = new S3Client({
    region: process.env.STORAGE_REGION ?? 'ap-south-1',
    credentials: {
      accessKeyId:     process.env.STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
    },
    ...(process.env.STORAGE_ENDPOINT
      ? { endpoint: process.env.STORAGE_ENDPOINT, forcePathStyle: true }
      : {}),
  });
  return _s3;
}

const BUCKET = process.env.STORAGE_BUCKET ?? '';

// ─── Local filesystem fallback (dev without S3) ───────────────────────────────
function localDir(): string {
  const dir = path.resolve(process.env.DATA_DIR ?? 'data', 'storage');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function localKeyPath(key: string): string {
  // Replace path separators to avoid subdirectory issues in flat dev layout
  const safe = key.replace(/\//g, '__');
  return path.join(localDir(), safe);
}

function isLocal(): boolean {
  return !BUCKET;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Upload bytes to object storage. Returns the storage key. */
export async function uploadObject(
  key: string,
  bytes: Buffer | Uint8Array,
  contentType = 'application/octet-stream'
): Promise<void> {
  if (isLocal()) {
    fs.writeFileSync(localKeyPath(key), bytes);
    return;
  }
  await getS3().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: bytes,
    ContentType: contentType,
    // No public-read ACL — all access via signed URLs
  }));
}

/** Download raw bytes from storage (server-side only — agent uses signed URL). */
export async function downloadObject(key: string): Promise<Buffer> {
  if (isLocal()) {
    return fs.readFileSync(localKeyPath(key));
  }
  const response = await getS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!response.Body) throw new Error('Empty object body');
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Delete an object (document cleanup after retention expires). */
export async function deleteObject(key: string): Promise<void> {
  if (isLocal()) {
    try { fs.unlinkSync(localKeyPath(key)); } catch (error) { if((error as NodeJS.ErrnoException).code !== 'ENOENT')throw error; }
    return;
  }
  await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Build the shop-scoped storage key for a document. */
export function documentKey(shopId: string, docId: string): string {
  return `documents/${shopId}/${docId}.pdf`;
}

/** SHA-256 hex checksum of bytes. */
export function checksum(bytes: Buffer | Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
