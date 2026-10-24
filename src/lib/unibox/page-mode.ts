export type UniboxPageMode = "demo-preview" | "live";

export function resolveUniboxPageMode(backendConfigured: boolean): UniboxPageMode {
  return backendConfigured ? "live" : "demo-preview";
}
