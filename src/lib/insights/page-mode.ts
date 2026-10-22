export type InsightsPageMode = "demo-preview" | "live";

export function resolveInsightsPageMode(supabaseConfigured: boolean): InsightsPageMode {
  return supabaseConfigured ? "live" : "demo-preview";
}
