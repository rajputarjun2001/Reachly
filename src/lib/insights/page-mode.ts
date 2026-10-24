export type InsightsPageMode = "demo-preview" | "live";

export function resolveInsightsPageMode(backendConfigured: boolean): InsightsPageMode {
  return backendConfigured ? "live" : "demo-preview";
}
