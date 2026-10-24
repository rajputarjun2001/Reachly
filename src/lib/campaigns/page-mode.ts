export type CampaignsPageMode = "demo-preview" | "live";

export function resolveCampaignsPageMode(backendConfigured: boolean): CampaignsPageMode {
  return backendConfigured ? "live" : "demo-preview";
}
