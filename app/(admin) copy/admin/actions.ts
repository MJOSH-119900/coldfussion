'use server';

import path from 'path';
import { revalidatePath } from 'next/cache';
import { Product } from '../../(public)/components/types/store';
import { readJson, writeJson } from '../../../lib/json-store';
import { requireAdmin } from '../../../lib/auth';
import { deleteStoreAssetIfUnused, uploadStoreAsset } from '../../../server/storage';


async function readProductsFile(): Promise<Product[]> {
  return readJson<Product[]>('products.json', []);
}

export async function getProductsAction() {
  await requireAdmin();
  return readJson<Product[]>('products.json', []);
}


export async function saveProductAction(formData: FormData, vendorId: string, productId?: string) {
  await requireAdmin();
  const products = await readProductsFile();
  const existing = productId ? products.find(p => p.id === productId) : undefined;
  const productRecordId = existing?.id || productId || `prod-${Date.now()}`;
  const ownerVendorId = existing?.vendor_id || vendorId;
  const uploadedFiles = formData.getAll('image_files').filter((value): value is File => value instanceof File && value.size > 0);
  const uploadedImages: string[] = [];

  if (uploadedFiles.length) {
    if (uploadedFiles.length > 4) throw new Error('Upload a maximum of 4 product photos at a time.');
    for (const imageFile of uploadedFiles.slice(0, 4)) {
      if (imageFile.size > 500 * 1024) throw new Error('Images must be 500 KB or smaller after browser optimization.');
      const extension = path.extname(imageFile.name).toLowerCase() || '.jpg';
      const safeExtension = /^\.(jpg|jpeg|png|webp|gif|avif)$/.test(extension) ? extension : '.jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExtension}`;
      uploadedImages.push(await uploadStoreAsset(`${ownerVendorId}/products/${productRecordId}/${fileName}`, Buffer.from(await imageFile.arrayBuffer()), imageFile.type || 'application/octet-stream'));
    }
  }

  const images = (uploadedImages.length ? uploadedImages : existing?.images || []).slice(0, 4);
  const availableQuantity = Math.max(0, Number(formData.get('available_quantity') || 0));
  const compareAtRaw = Number(formData.get('compare_at_price') || 0);
  const compareAt = compareAtRaw > Number(formData.get('price') || 0) ? compareAtRaw : undefined;

  const productData: Product = {
    id: productRecordId,
    vendor_id: ownerVendorId,
    title: String(formData.get('title') || ''),
    description: String(formData.get('description') || ''),
    price: Number(formData.get('price') || 0),
    compare_at_price: compareAt,
    available_quantity: availableQuantity,
    is_available: formData.get('is_available') === 'true' && availableQuantity > 0,
    giveaway: formData.get('giveaway') === 'true',
    giveaway_announcement: String(formData.get('giveaway_announcement') || '').trim() || undefined,
    images,
    category: String(formData.get('category') || 'Other'),
    tags: String(formData.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
    likes_count: existing?.likes_count || 0,
    vendor_whatsapp: String(formData.get('vendor_whatsapp') || ''),
    detail_gallery_enabled: formData.get('detail_gallery_enabled') === 'true',
    is_latest: formData.get('is_latest') === 'true',
    is_top_selling: formData.get('is_top_selling') === 'true',
  };

  const updatedProducts = productId
    ? products.map(p => p.id === productId ? productData : p)
    : [...products, productData];

  await writeJson('products.json', updatedProducts);
  if (existing) await Promise.all(existing.images.filter(image => image.startsWith('/uploads/') && !productData.images.includes(image)).map(deleteStoreAssetIfUnused));
  revalidatePath('/');
  revalidatePath('/admin');
  if (productId) revalidatePath(`/product/${productId}`);
  return { success: true, product: productData };
}

export async function deleteProductAction(id: string) {
  await requireAdmin();
  const products = await readProductsFile();
  const targetProduct = products.find(p => p.id === id);

  const filtered = products.filter(p => p.id !== id);
  await writeJson('products.json', filtered);
  if (targetProduct) await Promise.all(targetProduct.images.filter(image => image.startsWith('/uploads/')).map(deleteStoreAssetIfUnused));
  revalidatePath('/');
  revalidatePath('/admin');
  return { success: true };
}
