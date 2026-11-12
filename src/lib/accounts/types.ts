export type AccountStatus = "connecting" | "active" | "disconnected" | "flagged";

export type LinkedInAccountView = {
  id: string;
  label: string | null;
  display_name: string;
  linkedin_email: string;
  full_name: string | null;
  headline: string | null;
  profile_url: string | null;
  status: AccountStatus;
  flag_reason: string | null;
  /** OIDC identity bound (Sign In with LinkedIn). */
  identity_verified: boolean;
  /** Browser session stored for Playwright outreach. */
  outreach_ready: boolean;
  daily_limit: number;
  today_sent_count: number;
  last_health_check: string | null;
  last_sent_at: string | null;
  created_at: string;
};

export type AccountOption = {
  id: string;
  label: string;
  status: AccountStatus;
  daily_limit: number;
};

export type AccountHealth = {
  status: AccountStatus;
  valid: boolean;
  today_sent_count: number;
  daily_limit: number;
};
