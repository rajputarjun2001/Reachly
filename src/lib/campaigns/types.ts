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
  account_label?: string | null;
};

export type CampaignRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  lead_list_id: string | null;
  settings: CampaignSettings;
  created_by: string;
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
  lead_count: number;
  step_count: number;
};

export type CampaignWithSteps = CampaignSummary & {
  steps: CampaignStepRow[];
};

export type CampaignListFilter = "all" | "active" | "draft" | "archived";
