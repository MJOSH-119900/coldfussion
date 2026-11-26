import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseAdminClient } from './supabase-admin';
import { getSupabaseConfig } from './supabase';
import { prisma } from './db';

export const STORAGE_BUCKET = 'store-assets';
export const PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_IMAGE_UPLOAD_BYTES = 500 * 1024;
export const MAX_PRODUCT_IMAGE_BYTES = 70 * 1024;
export const VENDOR_VERIFICATION_BUCKET = 'vendor-verification-private';
export const MAX_VENDOR_DOCUMENT_BYTES = 1024 * 1024;

async function ensureProductImageBucket() {
  const storage = createSupabaseAdminClient().storage;
  const current = await storage.getBucket(PRODUCT_IMAGE_BUCKET);
  const isConfigured = (bucket: NonNullable<typeof current.data>) =>
    bucket.public && bucket.file_size_limit !== undefined && bucket.file_size_limit <= 75 * 1024 &&
    Boolean(bucket.allowed_mime_types?.length) && bucket.allowed_mime_types!.every(type => type === 'image/webp');
  if (current.data) {
    if (isConfigured(current.data)) return;
    throw new Error('Configure the product-images bucket as public, WebP-only, and limited to 75 KB.');
  }

  const { error } = await storage.createBucket(PRODUCT_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: 75 * 1024,
    allowedMimeTypes: ['image/webp'],
  });
  if (!error) return;
  const afterCreate = await storage.getBucket(PRODUCT_IMAGE_BUCKET);
  if (afterCreate.data && isConfigured(afterCreate.data)) return;
  throw new Error(`Could not prepare product image storage: ${error.message}`);
}

async function ensureVendorVerificationBucket() {
  const storage = createSupabaseAdminClient().storage;
  const current = await storage.getBucket(VENDOR_VERIFICATION_BUCKET);
  if (current.data && !current.data.public) return;
  if (current.data?.public) throw new Error('The vendor verification bucket must be private.');

  const { error } = await storage.createBucket(VENDOR_VERIFICATION_BUCKET, {
    public: false,
    fileSizeLimit: MAX_VENDOR_DOCUMENT_BYTES,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  });
  if (!error) return;

  // Concurrent first uploads can both observe a missing bucket. Accept the
  // second create only if the existing bucket is private and correctly named.
  const afterCreate = await storage.getBucket(VENDOR_VERIFICATION_BUCKET);
  if (afterCreate.data && !afterCreate.data.public) return;
  throw new Error(`Could not prepare private vendor document storage: ${error.message}`);
}

export async function uploadVendorVerificationFile(path: string, bytes: Buffer, contentType: string) {
  if (bytes.byteLength > MAX_VENDOR_DOCUMENT_BYTES) throw new Error('Verification files must be 1 MB or smaller.');
  await ensureVendorVerificationBucket();
  const { error } = await createSupabaseAdminClient().storage.from(VENDOR_VERIFICATION_BUCKET).upload(path, bytes, {
    contentType, upsert: false, cacheControl: '0',
  });
  if (error) throw new Error(`Could not save private vendor documents: ${error.message}`);
  return path;
}

export async function createVendorVerificationSignedUrl(path: string) {
  const { data, error } = await createSupabaseAdminClient().storage
    .from(VENDOR_VERIFICATION_BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(`Could not open the private vendor document: ${error.message}`);
  return data.signedUrl;
}

export async function deleteVendorVerificationFile(path: string) {
  if (!path) return;
  const { error } = await createSupabaseAdminClient().storage.from(VENDOR_VERIFICATION_BUCKET).remove([path]);
  if (error) throw new Error(`Could not remove private vendor document: ${error.message}`);
}

export async function uploadStoreAsset(path: string, bytes: Buffer, contentType: string, maxBytes = MAX_IMAGE_UPLOAD_BYTES) {
  if (bytes.byteLength > maxBytes) throw new Error(`Uploads must be ${Math.floor(maxBytes / 1024)} KB or smaller.`);
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType, upsert: true, cacheControl: '31536000',
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return `/uploads/${path}`;
}

/** Server-side upload used after the browser has compressed a product photo. */
export async function uploadCompressedProductImage(vendorId: string, productId: string, bytes: Buffer) {
  if (!vendorId || vendorId.includes('/') || vendorId.includes('..')) throw new Error('Invalid product image owner.');
  if (!productId || productId.includes('/') || productId.includes('..')) throw new Error('Invalid product image record.');
  if (bytes.byteLength > MAX_PRODUCT_IMAGE_BYTES) throw new Error('Product images must be 70 KB or smaller.');
  if (bytes.byteLength < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Product images must be valid WebP files.');
  }

  await ensureProductImageBucket();
  const path = `${vendorId}/products/${productId}/${randomUUID()}.webp`;
  // Bucket settings enforce a 75 KB server-side limit and image/webp MIME type.
  // This app keeps writes/removals behind authenticated server actions, which
  // verify vendor ownership or admin role before using the service key. If
  // direct browser Storage access is added, RLS must grant insert/update/delete
  // (including remove) only to the owning auth.uid() vendor and authorized admins.
  const bucket = createSupabaseAdminClient().storage.from(PRODUCT_IMAGE_BUCKET);
  const { error } = await bucket.upload(path, bytes, {
    contentType: 'image/webp', upsert: false, cacheControl: '31536000',
  });
  if (error) throw new Error(`Supabase product image upload failed: ${error.message}`);
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** Extracts the exact object path from this app's proxy URL or bucket public URL. */
export function getStoreAssetPathFromUrl(value: string) {
  const input = String(value || '').trim();
  if (!input) return undefined;
  let candidate: string | undefined;
  if (input.startsWith('/uploads/')) {
    candidate = input.slice('/uploads/'.length);
  } else {
    const { url } = getSupabaseConfig();
    try {
      const parsed = new URL(input);
      if (parsed.origin !== new URL(url).origin) return undefined;
      const bucketName = [PRODUCT_IMAGE_BUCKET, STORAGE_BUCKET].find(bucket =>
        parsed.pathname.startsWith(`/storage/v1/object/public/${bucket}/`));
      if (!bucketName) return undefined;
      const prefix = `/storage/v1/object/public/${bucketName}/`;
      candidate = `${bucketName}/${decodeURIComponent(parsed.pathname.slice(prefix.length))}`;
    } catch {
      return undefined;
    }
  }
  if (!candidate || candidate.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'))) return undefined;
  return candidate;
}

/** Deletes an unreferenced product image after its database reference is removed. */
export async function deleteProductImage(imageUrl: string) {
  const path = getStoreAssetPathFromUrl(imageUrl);
  if (!path) return false;
  try {
    return await deleteStoreAssetIfUnused(path);
  } catch (error) {
    console.error('Could not delete an unreferenced product image:', { path, error });
    return false;
  }
}

export async function deleteStoreAsset(path: string) {
  const normalized = getStoreAssetPathFromUrl(path) ?? path.replace(/^\/uploads\//, '');
  if (!normalized || normalized.includes('..')) return;
  const bucket = normalized.startsWith(`${PRODUCT_IMAGE_BUCKET}/`) ? PRODUCT_IMAGE_BUCKET : STORAGE_BUCKET;
  const objectPath = bucket === PRODUCT_IMAGE_BUCKET ? normalized.slice(`${PRODUCT_IMAGE_BUCKET}/`.length) : normalized;
  const { error } = await createSupabaseAdminClient().storage.from(bucket).remove([objectPath]);
  if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
}

export async function deleteStoreAssetIfUnused(path: string) {
  const normalized = getStoreAssetPathFromUrl(path) ?? path.replace(/^\/uploads\//, '');
  if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'))) return false;
  const assetUrl = `/uploads/${normalized}`;
  const [products, vendors, requests, productRequests, orders, tracks, settings] = await Promise.all([
    prisma.product.findMany({ select: { images: true } }),
    prisma.vendor.findMany({ select: { logo: true } }),
    prisma.vendorRequest.findMany({ select: { logo: true } }),
    prisma.vendorProductRequest.findMany({ select: { productImage: true } }),
    prisma.orderRecord.findMany({ include: { items: { select: { productImage: true } } } }),
    prisma.musicTrack.findMany({ select: { file: true } }),
    prisma.storeSetting.findMany({ select: { value: true } }),
  ]);
  const directReferences = [
    ...products.flatMap(row => row.images),
    ...vendors.map(row => row.logo),
    ...requests.map(row => row.logo),
    ...productRequests.map(row => row.productImage ?? ''),
    ...orders.flatMap(row => row.items.map(item => item.productImage ?? '')),
    ...tracks.map(row => row.file),
  ];
  const referencesAsset = (value: unknown) => typeof value === 'string' &&
    (value === assetUrl || getStoreAssetPathFromUrl(value) === normalized);
  const containsReference = (value: unknown): boolean => {
    if (referencesAsset(value)) return true;
    if (Array.isArray(value)) return value.some(containsReference);
    if (typeof value === 'object' && value !== null) return Object.values(value).some(containsReference);
    return false;
  };
  const settingReferences = settings.some(row => {
    try { return containsReference(JSON.parse(row.value)); }
    catch { return row.value === assetUrl; }
  });
  if (directReferences.some(referencesAsset) || settingReferences) return false;
  await deleteStoreAsset(normalized);
  return true;
}

export async function getStoreAssetUrl(path: string) {
  const normalized = getStoreAssetPathFromUrl(path) ?? path.replace(/^\/uploads\//, '');
  const bucket = normalized.startsWith(`${PRODUCT_IMAGE_BUCKET}/`) ? PRODUCT_IMAGE_BUCKET : STORAGE_BUCKET;
  const objectPath = bucket === PRODUCT_IMAGE_BUCKET ? normalized.slice(`${PRODUCT_IMAGE_BUCKET}/`.length) : normalized;
  const { data } = createSupabaseAdminClient().storage.from(bucket).getPublicUrl(objectPath);
  return data.publicUrl;
}
