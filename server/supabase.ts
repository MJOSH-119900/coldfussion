import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and a Supabase publishable/anon key must be configured.",
    );
  }

  return { url, key };
}

export async function createSupabaseServerClient() {
  const { url, key } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

export function getAuthCallbackUrl(nextPath: string) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!siteUrl) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be configured for Supabase Auth links.");
  }

  const base = new URL(siteUrl);
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS in production.");
  }
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    throw new Error("Supabase Auth redirect path must be local to this site.");
  }

  const callback = new URL("/auth/callback", base);
  callback.searchParams.set("next", nextPath);
  return callback.toString();
}

export { getSupabaseConfig };
