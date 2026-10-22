export type UniboxPageMode = "demo-preview" | "live";

export function resolveUniboxPageMode(supabaseConfigured: boolean): UniboxPageMode {
  return supabaseConfigured ? "live" : "demo-preview";
}
