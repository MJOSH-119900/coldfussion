import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = 'store-assets';
const root = path.resolve('public/uploads');
const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.webm': 'audio/webm' };

async function list(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const paths = await Promise.all(entries.map(entry => entry.isDirectory()
    ? list(path.join(dir, entry.name))
    : Promise.resolve([path.join(dir, entry.name)])));
  return paths.flat();
}

const { data: existing } = await supabase.storage.getBucket(bucket);
if (!existing) {
  const { error } = await supabase.storage.createBucket(bucket, { public: true, fileSizeLimit: '50MB' });
  if (error && !/already exists/i.test(error.message)) throw error;
}
const files = await list(root);
const missing: string[] = [];
for (const file of files) {
  const objectPath = path.relative(root, file).split(path.sep).join('/');
  const bytes = await fs.readFile(file).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') { missing.push(objectPath); return undefined; }
    throw error;
  });
  if (!bytes) continue;
  const { error } = await supabase.storage.from(bucket).upload(objectPath, bytes, {
    contentType: mime[path.extname(file).toLowerCase()] || 'application/octet-stream', upsert: true,
  });
  if (error) throw new Error(`${objectPath}: ${error.message}`);
}
console.log(`Uploaded ${files.length - missing.length} of ${files.length} files to Supabase Storage bucket ${bucket}.`);
if (missing.length) console.warn(`Skipped ${missing.length} missing local files: ${missing.join(', ')}`);
