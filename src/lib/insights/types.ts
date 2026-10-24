import type { CampaignOutreachStats, CampaignStatus } from "@/lib/campaigns/types";

export type DayCount = { date: string; count: number };

export type LeadsByListRow = { list_id: string; name: string; count: number };

export type CampaignStatusCounts = Record<CampaignStatus, number>;

export type OutreachSummary = {
  connections_sent: number;
  connections_accepted: number;
  acceptance_rate: number;
  replied: number;
  reply_rate: number;
  messages_sent: number;
  active_campaigns: number;
  active_accounts: number;
};

export type OutreachDay = { date: string; sent: number; accepted: number; replied: number };

export type RecentCampaignRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  lead_count: number;
  step_count: number;
  created_at: string;
  stats: CampaignOutreachStats;
};

export type CampaignPerformanceRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  total_leads: number;
  connections_sent: number;
  connections_accepted: number;
  messages_sent: number;
  replied: number;
  acceptance_rate: number;
  reply_rate: number;
};

export type WeekdayRow = { day: string; sent: number; accepted: number; acceptance_rate: number };

export type DashboardInsights = {
  total_leads: number;
  lead_list_count: number;
  campaign_count: number;
  campaign_by_status: CampaignStatusCounts;
  recent_campaigns: RecentCampaignRow[];
  leads_added_last_7_days: DayCount[];
  outreach: OutreachSummary;
  outreach_last_7_days: OutreachDay[];
};

export type AnalyticsInsights = {
  total_leads: number;
  lead_list_count: number;
  campaign_count: number;
  campaign_by_status: CampaignStatusCounts;
  leads_by_list: LeadsByListRow[];
  leads_created_last_30_days: DayCount[];
  campaigns_created_last_30_days: DayCount[];
  outreach: OutreachSummary;
  outreach_last_30_days: OutreachDay[];
  campaign_performance: CampaignPerformanceRow[];
  best_days: WeekdayRow[];
};
