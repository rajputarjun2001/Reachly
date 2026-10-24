import type { PipelineStage } from "mongoose";
import { AutomationEvent, Campaign, Lead, LeadList, LinkedInAccount } from "../models";
import { badRequest } from "../utils/errors";
import { oid, type AuthContext } from "./context";

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const OUTREACH_EVENTS = ["connection_sent", "connection_accepted", "reply_received"];

export function periodStart(period = "30d", allowAll = true): Date | null {
  if (period === "all" && allowAll) return null;
  const days = PERIOD_DAYS[period];
  if (!days) {
    throw badRequest(`period must be one of ${Object.keys(PERIOD_DAYS).join(", ")}${allowAll ? ", all" : ""}`);
  }
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

export const rate = (num: number, den: number) => (den ? Math.round((num / den) * 1000) / 10 : 0);

export type OutreachOverview = {
  period: string;
  connectionsSent: number;
  connectionsAccepted: number;
  acceptanceRate: number;
  replied: number;
  replyRate: number;
  messagesSent: number;
  activeCampaigns: number;
  activeAccounts: number;
};

export async function overview(ctx: AuthContext, period = "30d"): Promise<OutreachOverview> {
  const workspaceId = oid(ctx.workspaceId);
  const start = periodStart(period);
  const match: Record<string, unknown> = {
    workspaceId,
    eventType: { $in: [...OUTREACH_EVENTS, "msg1_sent", "msg2_sent", "msg3_sent", "msg_sent_manual"] },
  };
  if (start) match.createdAt = { $gte: start };

  const [grouped, activeCampaigns, activeAccounts] = await Promise.all([
    AutomationEvent.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]),
    Campaign.countDocuments({ workspaceId, status: "active" }),
    LinkedInAccount.countDocuments({ workspaceId, status: "active" }),
  ]);
  const counts: Record<string, number> = Object.fromEntries(grouped.map((g) => [g._id, g.count]));
  const connectionsSent = counts.connection_sent || 0;
  const connectionsAccepted = counts.connection_accepted || 0;
  const replied = counts.reply_received || 0;
  const messagesSent =
    (counts.msg1_sent || 0) + (counts.msg2_sent || 0) + (counts.msg3_sent || 0) + (counts.msg_sent_manual || 0);

  return {
    period,
    connectionsSent,
    connectionsAccepted,
    acceptanceRate: rate(connectionsAccepted, connectionsSent),
    replied,
    replyRate: rate(replied, connectionsAccepted),
    messagesSent,
    activeCampaigns,
    activeAccounts,
  };
}

export type DailyOutreach = { date: string; connectionsSent: number; accepted: number; replied: number };

export async function daily(ctx: AuthContext, period = "30d"): Promise<DailyOutreach[]> {
  const start = periodStart(period, false)!;
  const rows = await AutomationEvent.aggregate<{ _id: { date: string; type: string }; count: number }>([
    { $match: { workspaceId: oid(ctx.workspaceId), createdAt: { $gte: start }, eventType: { $in: OUTREACH_EVENTS } } },
    {
      $group: {
        _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, type: "$eventType" },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDate = new Map<string, DailyOutreach>();
  for (let d = new Date(start); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { date: key, connectionsSent: 0, accepted: 0, replied: 0 });
  }
  const field = { connection_sent: "connectionsSent", connection_accepted: "accepted", reply_received: "replied" } as const;
  for (const r of rows) {
    const entry = byDate.get(r._id.date);
    const key = field[r._id.type as keyof typeof field];
    if (entry && key) entry[key] = r.count;
  }
  return Array.from(byDate.values());
}

export type CampaignPerformance = {
  campaignId: string;
  name: string;
  status: string;
  totalLeads: number;
  leadStatusCounts: Record<string, number>;
  connectionsSent: number;
  connectionsAccepted: number;
  msg1Sent: number;
  msg2Sent: number;
  msg3Sent: number;
  replied: number;
  acceptanceRate: number;
  replyRate: number;
};

export async function campaignPerformance(ctx: AuthContext): Promise<CampaignPerformance[]> {
  const workspaceId = oid(ctx.workspaceId);
  const list = await Campaign.find({ workspaceId }).sort({ createdAt: -1 }).lean();
  const leadCounts = await Lead.aggregate<{ _id: { listId: unknown; status: string }; count: number }>([
    { $match: { workspaceId, listId: { $in: list.map((c) => c.leadListId).filter(Boolean) } } },
    { $group: { _id: { listId: "$listId", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const countsByList: Record<string, Record<string, number>> = {};
  for (const r of leadCounts) {
    const key = String(r._id.listId);
    countsByList[key] = countsByList[key] || {};
    countsByList[key][r._id.status] = r.count;
  }

  return list.map((c) => {
    const s = c.stats || ({} as NonNullable<typeof c.stats>);
    const statusCounts = (c.leadListId && countsByList[String(c.leadListId)]) || {};
    const totalLeads = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    return {
      campaignId: String(c._id),
      name: c.name,
      status: c.status,
      totalLeads,
      leadStatusCounts: statusCounts,
      connectionsSent: s.connectionsSent || 0,
      connectionsAccepted: s.connectionsAccepted || 0,
      msg1Sent: s.msg1Sent || 0,
      msg2Sent: s.msg2Sent || 0,
      msg3Sent: s.msg3Sent || 0,
      replied: s.replied || 0,
      acceptanceRate: rate(s.connectionsAccepted || 0, s.connectionsSent || 0),
      replyRate: rate(s.replied || 0, s.connectionsAccepted || 0),
    };
  });
}

/** Acceptance rate per weekday of the invitation: of connections sent that day, the share later accepted. */
export async function bestDays(ctx: AuthContext, period = "all") {
  const start = periodStart(period);
  const match: Record<string, unknown> = {
    workspaceId: oid(ctx.workspaceId),
    connectionSentAt: start ? { $gte: start } : { $exists: true, $ne: null },
  };
  const rows = await Lead.aggregate<{ _id: number; sent: number; accepted: number }>([
    { $match: match },
    {
      $group: {
        _id: { $dayOfWeek: "$connectionSentAt" },
        sent: { $sum: 1 },
        accepted: { $sum: { $cond: [{ $ifNull: ["$connectedAt", false] }, 1, 0] } },
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  return DAY_NAMES.map((dayName, i) => {
    const r = byDay.get(i + 1) || { sent: 0, accepted: 0 };
    return { dayOfWeek: i + 1, dayName, sent: r.sent, accepted: r.accepted, acceptanceRate: rate(r.accepted, r.sent) };
  });
}

/** Workspace-level counts used by the dashboard and analytics pages. */
export async function workspaceCounts(ctx: AuthContext) {
  const workspaceId = oid(ctx.workspaceId);
  const [totalLeads, leadListCount, campaignCount, statusRows] = await Promise.all([
    Lead.countDocuments({ workspaceId }),
    LeadList.countDocuments({ workspaceId }),
    Campaign.countDocuments({ workspaceId }),
    Campaign.aggregate<{ _id: string; count: number }>([
      { $match: { workspaceId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  return {
    totalLeads,
    leadListCount,
    campaignCount,
    campaignsByStatus: Object.fromEntries(statusRows.map((r) => [r._id, r.count])) as Record<string, number>,
  };
}

/** Documents created per UTC day for the given collection since `since`. */
export async function createdPerDay(ctx: AuthContext, collection: "leads" | "campaigns", since: Date) {
  const pipeline: PipelineStage[] = [
    { $match: { workspaceId: oid(ctx.workspaceId), createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
  ];
  const rows =
    collection === "leads"
      ? await Lead.aggregate<{ _id: string; count: number }>(pipeline)
      : await Campaign.aggregate<{ _id: string; count: number }>(pipeline);
  return new Map(rows.map((r) => [r._id, r.count]));
}
