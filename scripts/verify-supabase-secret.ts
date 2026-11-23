import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !secret) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.');
  process.exit(1);
}

if (!secret.startsWith('sb_secret_')) {
  console.error('SUPABASE_SECRET_KEY must be a Supabase Secret API key beginning with sb_secret_.');
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
if (error) {
  console.error(`Supabase Secret API key verification failed (HTTP ${error.status ?? 'unknown'}, ${error.code ?? 'unknown'}).`);
  process.exit(1);
}

console.log('Supabase Secret API key verified: Auth Admin API access succeeded. No key value was printed.');
