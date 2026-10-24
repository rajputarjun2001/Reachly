export type ProfileView = {
  id: string;
  email: string;
  full_name: string;
  timezone: string;
  role: "owner" | "member";
};

export type WorkspaceSettingsView = {
  id: string;
  name: string;
  plan: string;
  plan_daily_cap: number;
  daily_limit_per_account: number;
  sending_window_start: number;
  sending_window_end: number;
  send_on_weekends: boolean;
  timezone: string;
};

export type MemberView = {
  id: string;
  email: string;
  full_name: string;
  role: "owner" | "member";
  status: "active" | "pending";
  last_active_at: string | null;
  invite_expires_at: string | null;
};

export type BlacklistEntryView = {
  id: string;
  type: "domain" | "profile_url";
  value: string;
  created_at: string;
};

export type SettingsData = {
  profile: ProfileView;
  workspace: WorkspaceSettingsView;
  members: MemberView[];
  blacklist: BlacklistEntryView[];
};
