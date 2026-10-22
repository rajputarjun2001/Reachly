import { NextResponse } from "next/server";
import { WORKSPACE_READY_COOKIE } from "@/lib/auth/workspace-cookie";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createClientIfConfigured();
    if (supabase) {
      await supabase.auth.signOut();
    }
  }
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.delete(WORKSPACE_READY_COOKIE);
  return response;
}
