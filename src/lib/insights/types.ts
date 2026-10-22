import type { CampaignStatus } from "@/lib/campaigns/types";

export type DayCount = { date: string; count: number };

export type LeadsByListRow = { list_id: string; name: string; count: number };

export type CampaignStatusCounts = Record<CampaignStatus, number>;

export type RecentCampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  lead_count: number;
  step_count: number;
  created_at: string;
};

export type DashboardInsights = {
  total_leads: number;
  lead_list_count: number;
  campaign_count: number;
  campaign_by_status: CampaignStatusCounts;
  recent_campaigns: RecentCampaignRow[];
  leads_added_last_7_days: DayCount[];
};

export type AnalyticsInsights = {
  total_leads: number;
  lead_list_count: number;
  campaign_count: number;
  campaign_by_status: CampaignStatusCounts;
  leads_by_list: LeadsByListRow[];
  leads_created_last_30_days: DayCount[];
  campaigns_created_last_30_days: DayCount[];
};
