import { NextResponse } from "next/server";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export async function POST(request: Request) {
  if (isSupabaseConfigured()) {
    const supabase = await createClientIfConfigured();
    if (supabase) {
      await supabase.auth.signOut();
    }
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
