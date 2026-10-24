/**
 * Leads route rendering mode. Demo UI is only for an unconfigured backend.
 * When configured, never fall back to demo preview (avoids a static build + null workspace showing fake data).
 */
export type LeadsPageMode = "demo-preview" | "live";

export function resolveLeadsPageMode(backendConfigured: boolean): LeadsPageMode {
  return backendConfigured ? "live" : "demo-preview";
}
