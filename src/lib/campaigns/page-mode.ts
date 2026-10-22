export type CampaignsPageMode = "demo-preview" | "live";

export function resolveCampaignsPageMode(supabaseConfigured: boolean): CampaignsPageMode {
  return supabaseConfigured ? "live" : "demo-preview";
}
