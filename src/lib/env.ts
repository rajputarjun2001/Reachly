export type SupabasePublicEnv = {
  url: string;
  anonKey: string;
};

const urlKey = "NEXT_PUBLIC_SUPABASE_URL";
const anonKey = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

export function isSupabaseConfigured(): boolean {
  const url = process.env[urlKey]?.trim();
  const key = process.env[anonKey]?.trim();
  return Boolean(url && key && url.startsWith("https://"));
}

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  if (!isSupabaseConfigured()) return null;
  return {
    url: process.env[urlKey]!.trim(),
    anonKey: process.env[anonKey]!.trim(),
  };
}

export function getSupabaseConfigError(): string | null {
  const url = process.env[urlKey]?.trim();
  const key = process.env[anonKey]?.trim();
  if (!url && !key) {
    return "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see docs/SETUP.md).";
  }
  if (!url) return `Missing ${urlKey}.`;
  if (!key) return `Missing ${anonKey}.`;
  if (!url.startsWith("https://")) return `${urlKey} must be an https URL.`;
  return null;
}
