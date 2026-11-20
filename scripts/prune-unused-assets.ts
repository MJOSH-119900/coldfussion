import dotenv from 'dotenv';
import { createSupabaseAdminClient } from '../server/supabase-admin';
import { deleteStoreAssetIfUnused, STORAGE_BUCKET } from '../server/storage';
import { prisma } from '../server/db';

dotenv.config({ path: '.env.local' });
dotenv.config();
const storage = createSupabaseAdminClient().storage.from(STORAGE_BUCKET);

async function listFiles(prefix = ''): Promise<string[]> {
  const { data, error } = await storage.list(prefix, { limit: 1000 });
  if (error) throw new Error(`Could not list ${prefix || 'bucket root'}: ${error.message}`);
  const files: string[] = [];
  for (const entry of data ?? []) {
    const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null && entry.metadata === null) files.push(...await listFiles(objectPath));
    else files.push(objectPath);
  }
  return files;
}

const files = await listFiles();
let deleted = 0;
const retained: string[] = [];
for (const file of files) {
  if (await deleteStoreAssetIfUnused(file)) deleted++;
  else retained.push(file);
}
console.log(`Checked ${files.length} Storage assets and removed ${deleted} unreferenced files.`);
const [products, vendors, requests, bucketInfo, policies] = await Promise.all([
  prisma.product.findMany({ select: { id: true, vendorId: true, title: true, images: true } }),
  prisma.vendor.findMany({ select: { vendorId: true, logo: true } }),
  prisma.vendorRequest.findMany({ select: { requestId: true, status: true, logo: true } }),
  createSupabaseAdminClient().storage.getBucket(STORAGE_BUCKET),
  prisma.$queryRaw<Array<{ policyname: string; roles: string; cmd: string; qual: string; with_check: string }>>`
    SELECT policyname::text, array_to_string(roles, ',') AS roles, cmd::text,
      COALESCE(qual, '')::text AS qual, COALESCE(with_check, '')::text AS with_check
    FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
  `,
]);
console.log(`Bucket public-read setting: ${bucketInfo.data?.public ?? 'unavailable'}`);
console.log(`Storage object policies: ${JSON.stringify(policies)}`);
for (const file of retained) {
  const url = `/uploads/${file}`;
  const refs = [
    ...products.filter(row => row.images.includes(url)).map(row => `product ${row.id} (${row.vendorId}, ${row.title})`),
    ...vendors.filter(row => row.logo === url).map(row => `vendor ${row.vendorId}`),
    ...requests.filter(row => row.logo === url).map(row => `vendor request ${row.requestId} (${row.status})`),
  ];
  console.log(`${file} — ${refs.join('; ') || 'referenced by another record'}`);
}
await prisma.$disconnect();
