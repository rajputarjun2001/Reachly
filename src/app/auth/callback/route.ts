import { NextResponse } from "next/server";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { isSupabaseConfigured } from "@/lib/env";

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = getSafeRedirectPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClientIfConfigured();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}
