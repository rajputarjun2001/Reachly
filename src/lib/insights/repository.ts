import "server-only";

import * as analytics from "@server/domain/analytics";
import type { AuthContext } from "@server/domain/context";
import { ensureDb } from "@/lib/server/backend";
import { requireAuthContext, requireWorkspaceContext } from "@/lib/workspace/context";
import { listCampaigns } from "@/lib/campaigns/repository";
import { listLeadLists } from "@/lib/leads/repository";
import type { CampaignStatus } from "@/lib/campaigns/types";
import { emptyStatusCounts, lastNDayKeys } from "./aggregations";
import type {
  AnalyticsInsights,
  CampaignStatusCounts,
  DashboardInsights,
  DayCount,
  OutreachDay,
  OutreachSummary,
} from "./types";

async function scoped() {
  const ctx = await requireAuthContext();
  await ensureDb();
  return ctx;
}

function toStatusCounts(byStatus: Record<string, number>): CampaignStatusCounts {
  const counts = emptyStatusCounts();
  for (const [status, count] of Object.entries(byStatus)) {
    if (status in counts) counts[status as CampaignStatus] = count;
  }
  return counts;
}

function toSeries(map: Map<string, number>, dayKeys: string[]): DayCount[] {
  return dayKeys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

async function outreachSummary(ctx: AuthContext, period: "7d" | "30d"): Promise<OutreachSummary> {
  const o = await analytics.overview(ctx, period);
  return {
    connections_sent: o.connectionsSent,
    connections_accepted: o.connectionsAccepted,
    acceptance_rate: o.acceptanceRate,
    replied: o.replied,
    reply_rate: o.replyRate,
    messages_sent: o.messagesSent,
    active_campaigns: o.activeCampaigns,
    active_accounts: o.activeAccounts,
  };
}

async function outreachDaily(ctx: AuthContext, period: "7d" | "30d"): Promise<OutreachDay[]> {
  const rows = await analytics.daily(ctx, period);
  return rows.map((r) => ({ date: r.date, sent: r.connectionsSent, accepted: r.accepted, replied: r.replied }));
}

export async function getDashboardInsights(): Promise<DashboardInsights> {
  const ctx = await scoped();
  const dayKeys = lastNDayKeys(7);
  const since = new Date(`${dayKeys[0]}T00:00:00.000Z`);

  const [counts, campaigns, leadsPerDay, outreach, outreachDays] = await Promise.all([
    analytics.workspaceCounts(ctx),
    listCampaigns(),
    analytics.createdPerDay(ctx, "leads", since),
    outreachSummary(ctx, "30d"),
    outreachDaily(ctx, "7d"),
  ]);

  return {
    total_leads: counts.totalLeads,
    lead_list_count: counts.leadListCount,
    campaign_count: counts.campaignCount,
    campaign_by_status: toStatusCounts(counts.campaignsByStatus),
    recent_campaigns: campaigns.slice(0, 8).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      lead_count: c.lead_count,
      step_count: c.step_count,
      created_at: c.created_at,
      stats: c.stats,
    })),
    leads_added_last_7_days: toSeries(leadsPerDay, dayKeys),
    outreach,
    outreach_last_7_days: outreachDays,
  };
}

export async function getAnalyticsInsights(): Promise<AnalyticsInsights> {
  const ctx = await scoped();
  const dayKeys = lastNDayKeys(30);
  const since = new Date(`${dayKeys[0]}T00:00:00.000Z`);

  const [counts, lists, leadsPerDay, campaignsPerDay, outreach, outreachDays, performance, weekdays] =
    await Promise.all([
      analytics.workspaceCounts(ctx),
      listLeadLists(),
      analytics.createdPerDay(ctx, "leads", since),
      analytics.createdPerDay(ctx, "campaigns", since),
      outreachSummary(ctx, "30d"),
      outreachDaily(ctx, "30d"),
      analytics.campaignPerformance(ctx),
      analytics.bestDays(ctx, "all"),
    ]);

  return {
    total_leads: counts.totalLeads,
    lead_list_count: counts.leadListCount,
    campaign_count: counts.campaignCount,
    campaign_by_status: toStatusCounts(counts.campaignsByStatus),
    leads_by_list: lists.slice(0, 50).map((l) => ({ list_id: l.id, name: l.name, count: l.lead_count })),
    leads_created_last_30_days: toSeries(leadsPerDay, dayKeys),
    campaigns_created_last_30_days: toSeries(campaignsPerDay, dayKeys),
    outreach,
    outreach_last_30_days: outreachDays,
    campaign_performance: performance.map((p) => ({
      id: p.campaignId,
      name: p.name,
      status: p.status as CampaignStatus,
      total_leads: p.totalLeads,
      connections_sent: p.connectionsSent,
      connections_accepted: p.connectionsAccepted,
      messages_sent: p.msg1Sent + p.msg2Sent + p.msg3Sent,
      replied: p.replied,
      acceptance_rate: p.acceptanceRate,
      reply_rate: p.replyRate,
    })),
    best_days: weekdays.map((d) => ({
      day: d.dayName,
      sent: d.sent,
      accepted: d.accepted,
      acceptance_rate: d.acceptanceRate,
    })),
  };
}

export async function getWorkspaceGreetingName(): Promise<string> {
  const ctx = await requireWorkspaceContext();
  const name = ctx.fullName?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  if (ctx.email) return ctx.email.split("@")[0];
  return "there";
}
