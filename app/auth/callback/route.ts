import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../server/supabase";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedPath = request.nextUrl.searchParams.get("next") || "/";
  let nextPath =
    requestedPath.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/";
  if (new URL(nextPath, request.url).origin !== request.nextUrl.origin) {
    nextPath = "/";
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?authError=invalid-link", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Supabase auth callback failed:", error.message);
    return NextResponse.redirect(new URL("/?authError=invalid-link", request.url));
  }

  const { data: authData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("Supabase callback user lookup failed:", userError.message);
    return NextResponse.redirect(new URL("/?authError=invalid-link", request.url));
  }
  return NextResponse.redirect(new URL(nextPath, request.url));
}
