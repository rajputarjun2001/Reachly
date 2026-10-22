import { redirect } from "next/navigation";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { User } from "@supabase/supabase-js";

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClientIfConfigured();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
