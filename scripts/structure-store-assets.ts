import dotenv from 'dotenv';
import path from 'node:path';
import { createSupabaseAdminClient } from '../server/supabase-admin';
import { deleteStoreAssetIfUnused, STORAGE_BUCKET } from '../server/storage';
import { prisma } from '../server/db';

dotenv.config({ path: '.env.local' });
dotenv.config();
const storage = createSupabaseAdminClient().storage.from(STORAGE_BUCKET);
let moved = 0;

async function moveAsset(oldUrl: string, targetKey: string) {
  const oldKey = oldUrl.replace(/^\/uploads\//, '');
  const { data, error } = await storage.download(oldKey);
  if (error) throw new Error(`Could not read ${oldKey}: ${error.message}`);
  const extension = path.extname(oldKey).toLowerCase();
  const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
  const { error: uploadError } = await storage.upload(targetKey, Buffer.from(await data.arrayBuffer()), { contentType, upsert: true });
  if (uploadError) throw new Error(`Could not save ${targetKey}: ${uploadError.message}`);
  moved++;
  return `/uploads/${targetKey}`;
}

const products = await prisma.product.findMany();
for (const product of products) {
  let changed = false;
  const images: string[] = [];
  for (const [index, image] of product.images.entries()) {
    if (image.startsWith('/uploads/') && image.slice('/uploads/'.length).split('/').length === 1) {
      const filename = path.basename(image);
      images.push(await moveAsset(image, `vendors/${product.vendorId}/products/${product.id}/${index + 1}-${filename}`));
      changed = true;
    } else images.push(image);
  }
  if (changed) {
    await prisma.product.update({ where: { id: product.id }, data: { images } });
    for (const [index, image] of product.images.entries()) {
      if (image.startsWith('/uploads/') && image.slice('/uploads/'.length).split('/').length === 1)
        await deleteStoreAssetIfUnused(image);
    }
  }
}

const vendors = await prisma.vendor.findMany({ select: { vendorId: true, logo: true } });
for (const vendor of vendors) {
  if (vendor.logo.startsWith('/uploads/') && vendor.logo.slice('/uploads/'.length).split('/').length === 1) {
    const nextLogo = await moveAsset(vendor.logo, `vendors/${vendor.vendorId}/profile/${path.basename(vendor.logo)}`);
    await prisma.vendor.update({ where: { vendorId: vendor.vendorId }, data: { logo: nextLogo } });
    await deleteStoreAssetIfUnused(vendor.logo);
  }
}

console.log(`Moved ${moved} referenced assets into vendor/product/profile folders.`);
await prisma.$disconnect();
