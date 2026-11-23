import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./supabase";

export function createSupabaseAdminClient() {
  const { url } = getSupabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY must be configured on the server.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
