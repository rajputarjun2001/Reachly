export const appRoutes = {
  dashboard: "/dashboard",
  campaigns: "/campaigns",
  campaignDetail: (id: string) => `/campaigns/${id}`,
  leads: "/leads",
  accounts: "/accounts",
  unibox: "/unibox",
  analytics: "/analytics",
  settings: "/settings",
  onboarding: "/onboarding",
} as const;

export type SettingsPanelId =
  | "profile"
  | "workspace"
  | "members"
  | "billing"
  | "integrations"
  | "blacklist"
  | "safety";

export const settingsPanelMap: Record<SettingsPanelId, string> = {
  profile: "sProfile",
  workspace: "sWorkspace",
  members: "sMembers",
  billing: "sBilling",
  integrations: "sIntegrations",
  blacklist: "sBlacklist",
  safety: "sSafety",
};
