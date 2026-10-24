export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "archived"
  | "completed"
  | "cancelled"
  | "failed";

export type CampaignStepType = "connection_request" | "message";

export type CampaignStepConfiguration = {
  label?: string;
  body_template?: string;
  delay_days?: number;
};

export type CampaignSettings = {
  goal?: string | null;
  daily_limit?: number | null;
  timezone?: string | null;
};

export type CampaignOutreachStats = {
  total_leads: number;
  connections_sent: number;
  connections_accepted: number;
  messages_sent: number;
  replied: number;
};

export type CampaignRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  lead_list_id: string | null;
  linkedin_account_id: string | null;
  settings: CampaignSettings;
  stats: CampaignOutreachStats;
  paused_reason: string | null;
  launched_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignStepRow = {
  id: string;
  campaign_id: string;
  workspace_id: string;
  step_order: number;
  step_type: CampaignStepType;
  configuration: CampaignStepConfiguration;
  created_at: string;
  updated_at: string;
};

export type CampaignSummary = CampaignRow & {
  lead_list_name: string | null;
  linkedin_account_label: string | null;
  lead_count: number;
  step_count: number;
};

export type CampaignWithSteps = CampaignSummary & {
  steps: CampaignStepRow[];
  lead_status_counts: Record<string, number>;
};

export type CampaignListFilter = "all" | "active" | "draft" | "archived";
