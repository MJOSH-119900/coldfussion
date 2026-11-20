import 'server-only';
import { createSupabaseAdminClient } from './supabase-admin';
import { prisma } from './db';

export const STORAGE_BUCKET = 'store-assets';
export const MAX_IMAGE_UPLOAD_BYTES = 500 * 1024;

export async function uploadStoreAsset(path: string, bytes: Buffer, contentType: string, maxBytes = MAX_IMAGE_UPLOAD_BYTES) {
  if (bytes.byteLength > maxBytes) throw new Error(`Uploads must be ${Math.floor(maxBytes / 1024)} KB or smaller.`);
  const client = createSupabaseAdminClient();
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType, upsert: true, cacheControl: '31536000',
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return `/uploads/${path}`;
}

export async function deleteStoreAsset(path: string) {
  const normalized = path.replace(/^\/uploads\//, '');
  if (!normalized || normalized.includes('..')) return;
  const { error } = await createSupabaseAdminClient().storage.from(STORAGE_BUCKET).remove([normalized]);
  if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
}

export async function deleteStoreAssetIfUnused(path: string) {
  const normalized = path.replace(/^\/uploads\//, '');
  if (!normalized || normalized.includes('..')) return false;
  const assetUrl = `/uploads/${normalized}`;
  const [products, vendors, requests, orders, tracks, settings] = await Promise.all([
    prisma.product.findMany({ select: { images: true } }),
    prisma.vendor.findMany({ select: { logo: true } }),
    prisma.vendorRequest.findMany({ select: { logo: true } }),
    prisma.orderRecord.findMany({ include: { items: { select: { productImage: true } } } }),
    prisma.musicTrack.findMany({ select: { file: true } }),
    prisma.storeSetting.findMany({ select: { value: true } }),
  ]);
  const directReferences = [
    ...products.flatMap(row => row.images),
    ...vendors.map(row => row.logo),
    ...requests.map(row => row.logo),
    ...orders.flatMap(row => row.items.map(item => item.productImage ?? '')),
    ...tracks.map(row => row.file),
  ];
  const containsReference = (value: unknown): boolean => {
    if (value === assetUrl) return true;
    if (Array.isArray(value)) return value.some(containsReference);
    if (typeof value === 'object' && value !== null) return Object.values(value).some(containsReference);
    return false;
  };
  const settingReferences = settings.some(row => {
    try { return containsReference(JSON.parse(row.value)); }
    catch { return row.value === assetUrl; }
  });
  if (directReferences.includes(assetUrl) || settingReferences) return false;
  await deleteStoreAsset(normalized);
  return true;
}

export async function getStoreAssetUrl(path: string) {
  const normalized = path.replace(/^\/uploads\//, '');
  const { data } = createSupabaseAdminClient().storage.from(STORAGE_BUCKET).getPublicUrl(normalized);
  return data.publicUrl;
}
