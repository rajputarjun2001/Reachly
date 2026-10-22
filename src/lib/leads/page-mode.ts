/**
 * Leads route rendering mode. Demo UI is only for unconfigured Supabase.
 * When configured, never fall back to demo preview (avoids static build + null workspace showing fake data).
 */
export type LeadsPageMode = "demo-preview" | "live";

export function resolveLeadsPageMode(supabaseConfigured: boolean): LeadsPageMode {
  return supabaseConfigured ? "live" : "demo-preview";
}
