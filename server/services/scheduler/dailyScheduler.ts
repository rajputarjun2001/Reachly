import type { Types } from "mongoose";
import { Campaign, Lead, LinkedInAccount, Workspace, type CampaignDoc, type LeadStatus } from "../../models";
import { getQueues } from "./queues";
import { enqueueMessage, messageJobId, nextMessageDueAt } from "./sequence";
import { effectiveDailyLimit, sendingWindowFor, sentToday } from "./limits";
import { DAY, MINUTE, dateKey, generateRandomSlots, windowStillOpenToday } from "../../utils/schedule";

const INVITE_EXPIRY_DAYS = 30;
export const INBOX_POLL_EVERY_MS = 2 * 60 * 60 * 1000;
const SEQUENCE_ORDER: LeadStatus[] = ["pending", "connection_sent", "connected", "msg1_sent", "msg2_sent", "msg3_sent"];

const inboxSchedulerId = (accountId: unknown) => `inbox-poll-${String(accountId)}`;

export async function ensureInboxPoll(accountId: Types.ObjectId | string) {
  await getQueues().inboxPollQueue.upsertJobScheduler(
    inboxSchedulerId(accountId),
    { every: INBOX_POLL_EVERY_MS },
    { name: "poll-inbox", data: { accountId: String(accountId) } },
  );
}

export async function removeInboxPoll(accountId: Types.ObjectId | string) {
  await getQueues().inboxPollQueue.removeJobScheduler(inboxSchedulerId(accountId));
}

/**
 * Spreads today's connection requests over the remaining sending window. Runs at most once per
 * local day per campaign (tracked by `lastScheduledFor`), so the hourly cron is idempotent.
 */
export async function scheduleDailyConnections(campaign: CampaignDoc, now = new Date()): Promise<number> {
  if (!campaign.linkedinAccountId || !campaign.leadListId) return 0;
  const account = await LinkedInAccount.findById(campaign.linkedinAccountId);
  if (!account || account.status !== "active") return 0;
  const workspace = await Workspace.findById(campaign.workspaceId);
  if (!workspace) return 0;

  const window = sendingWindowFor(workspace, campaign);
  if (!windowStillOpenToday(window, now)) return 0;
  const today = dateKey(now, window.timezone);
  if (campaign.lastScheduledFor === today) return 0;

  let remaining = effectiveDailyLimit(account, workspace) - sentToday(account, workspace, now);
  if (campaign.settings?.dailyLimit) remaining = Math.min(remaining, campaign.settings.dailyLimit);

  const leads =
    remaining > 0
      ? await Lead.find({ listId: campaign.leadListId, status: "pending" })
          .sort({ createdAt: 1 })
          .limit(remaining)
          .select("_id")
      : [];
  const slots = generateRandomSlots(
    window.sendingWindowStart,
    window.sendingWindowEnd,
    leads.length,
    now,
    window.timezone,
  );

  for (let i = 0; i < slots.length; i += 1) {
    await getQueues().connectionQueue.add(
      "send-connection",
      { leadId: String(leads[i]._id), campaignId: String(campaign._id), accountId: String(account._id) },
      {
        // Same lead + same day collapses into one job if scheduling runs twice.
        jobId: `conn-${leads[i]._id}-${today}`,
        delay: slots[i] * MINUTE,
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
  }
  await Campaign.updateOne({ _id: campaign._id }, { $set: { lastScheduledFor: today } });
  campaign.lastScheduledFor = today;
  return slots.length;
}

/** Queues follow-up messages that become due within the next day. */
export async function scheduleDueMessages(campaign: CampaignDoc, now = new Date()): Promise<number> {
  if (!campaign.messages?.length || !campaign.linkedinAccountId || !campaign.leadListId) return 0;
  const leads = await Lead.find({
    listId: campaign.leadListId,
    status: { $in: ["connected", "msg1_sent", "msg2_sent"] },
  });
  const horizon = new Date(now.getTime() + DAY);
  let queued = 0;
  for (const lead of leads) {
    const next = nextMessageDueAt(campaign, lead);
    if (!next || next.dueAt > horizon) continue;
    await enqueueMessage(
      {
        leadId: lead._id,
        campaignId: campaign._id,
        accountId: campaign.linkedinAccountId,
        messageStep: next.stepNumber,
      },
      next.dueAt.getTime() - now.getTime(),
      messageJobId(lead._id, next.stepNumber),
    );
    queued += 1;
  }
  return queued;
}

export async function expireStaleInvitations(campaign: CampaignDoc, now = new Date()): Promise<number> {
  if (!campaign.leadListId) return 0;
  const cutoff = new Date(now.getTime() - INVITE_EXPIRY_DAYS * DAY);
  const res = await Lead.updateMany(
    { listId: campaign.leadListId, status: "connection_sent", connectionSentAt: { $lt: cutoff } },
    { $set: { status: "skipped", skipReason: "connection_not_accepted" } },
  );
  return res.modifiedCount || 0;
}

/** Marks the campaign completed when no lead can progress any further. */
export async function checkCampaignCompletion(campaign: CampaignDoc): Promise<boolean> {
  if (!campaign.leadListId) return false;
  const steps = (campaign.messages || []).map((m) => m.step);
  const finalStatus = steps.length ? `msg${Math.max(...steps)}_sent` : "connected";
  const progressing = SEQUENCE_ORDER.slice(0, SEQUENCE_ORDER.indexOf(finalStatus as LeadStatus));
  const remaining = await Lead.countDocuments({ listId: campaign.leadListId, status: { $in: progressing } });
  if (remaining > 0) return false;
  await Campaign.updateOne({ _id: campaign._id, status: "active" }, { $set: { status: "completed", completedAt: new Date() } });
  return true;
}

export type CampaignDayResult = {
  campaignId: Types.ObjectId;
  completed?: boolean;
  connections?: number;
  messages?: number;
  expired?: number;
  error?: string;
};

export async function runCampaignDay(campaign: CampaignDoc, now = new Date()): Promise<CampaignDayResult> {
  const expired = await expireStaleInvitations(campaign, now);
  const completed = await checkCampaignCompletion(campaign);
  if (completed) return { campaignId: campaign._id, completed: true, expired };
  const connections = await scheduleDailyConnections(campaign, now);
  const messages = await scheduleDueMessages(campaign, now);
  return { campaignId: campaign._id, connections, messages, expired };
}

export async function startAllActiveCampaigns(now = new Date()) {
  const campaigns = await Campaign.find({ status: "active" });
  const results: CampaignDayResult[] = [];
  for (const campaign of campaigns) {
    try {
      results.push(await runCampaignDay(campaign, now));
    } catch (err) {
      const message = (err as Error).message;
      console.error(`[scheduler] campaign ${campaign._id} failed:`, message);
      results.push({ campaignId: campaign._id, error: message });
    }
  }

  const accounts = await LinkedInAccount.find({ status: "active" }).select("_id");
  for (const account of accounts) await ensureInboxPoll(account._id);

  return { campaigns: results, inboxPolls: accounts.length };
}
