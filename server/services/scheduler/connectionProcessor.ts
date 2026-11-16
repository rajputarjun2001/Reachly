import { Worker } from "bullmq";
import type { Types } from "mongoose";
import { Campaign, Lead, LinkedInAccount, Workspace, type CampaignDoc, type LeadDoc } from "../../models";
import { getRedis } from "../../config/redis";
import { QUEUE_NAMES } from "./queueNames";
import * as linkedinActions from "../playwright/linkedinActions";
import { loadAccountWithSecrets, runWithSession } from "../accountSession";
import { checkLeadBlacklisted } from "../../utils/blacklist";
import { renderTemplate } from "../../utils/template";
import { logEvent } from "../events";
import { scheduleNextMessage } from "./sequence";
import { effectiveDailyLimit, reserveDailySlot } from "./limits";
import type { ConnectionJobData, JobLike, JobOutcome } from "./jobTypes";

const { ERRORS } = linkedinActions;

type SkipCtx = { workspaceId: Types.ObjectId; accountId: string; campaignId: string; leadId: string };

async function skip(ctx: SkipCtx, reason: string, extra: Record<string, unknown> = {}): Promise<JobOutcome> {
  await logEvent({
    workspaceId: ctx.workspaceId,
    linkedinAccountId: ctx.accountId,
    campaignId: ctx.campaignId,
    leadId: ctx.leadId,
    eventType: "job_skipped",
    payload: { job: "send-connection", reason, ...extra },
  });
  return { skipped: true, reason };
}

async function markConnected(lead: LeadDoc, campaign: CampaignDoc, accountId: Types.ObjectId) {
  lead.status = "connected";
  lead.connectedAt = new Date();
  await lead.save();
  await Campaign.updateOne({ _id: campaign._id }, { $inc: { "stats.connectionsAccepted": 1 } });
  await logEvent({
    workspaceId: campaign.workspaceId,
    linkedinAccountId: accountId,
    campaignId: campaign._id,
    leadId: lead._id,
    eventType: "connection_accepted",
    payload: { source: "already_connected" },
  });
  await scheduleNextMessage(campaign, lead);
}

export async function processConnectionJob(job: JobLike<ConnectionJobData>): Promise<JobOutcome> {
  const { leadId, campaignId, accountId } = job.data;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return { skipped: true, reason: "campaign_not_found" };
  const ctx: SkipCtx = { workspaceId: campaign.workspaceId, accountId, campaignId, leadId };

  if (campaign.status !== "active") return skip(ctx, "campaign_not_active");

  const lead = await Lead.findById(leadId);
  if (!lead) return skip(ctx, "lead_not_found");
  if (lead.status !== "pending") return { skipped: true, reason: "lead_not_pending" };

  const account = await loadAccountWithSecrets(accountId);
  if (!account || account.status !== "active") return skip(ctx, "account_not_active");

  const workspace = await Workspace.findById(campaign.workspaceId);
  const limit = effectiveDailyLimit(account, workspace);

  const bl = await checkLeadBlacklisted(lead, campaign.workspaceId);
  if (bl.blacklisted) {
    lead.status = "blacklisted";
    lead.skipReason = bl.reason;
    await lead.save();
    return skip(ctx, "blacklisted", { match: bl.reason });
  }

  const releaseSlot = await reserveDailySlot(account._id, limit, workspace);
  if (!releaseSlot) return skip(ctx, "daily_limit_reached", { limit });

  const note = renderTemplate(campaign.connectionNote, lead).slice(0, 280);
  const result = await runWithSession(account, (cookies, opts) =>
    linkedinActions.sendConnectionRequest(cookies, lead.linkedinUrl, note, opts),
  );

  if (result.success) {
    const now = new Date();
    lead.status = "connection_sent";
    lead.connectionSentAt = now;
    await lead.save();
    await Campaign.updateOne({ _id: campaign._id }, { $inc: { "stats.connectionsSent": 1 } });
    await LinkedInAccount.updateOne({ _id: account._id }, { $set: { lastSentAt: now } });
    await logEvent({
      workspaceId: campaign.workspaceId,
      linkedinAccountId: account._id,
      campaignId: campaign._id,
      leadId: lead._id,
      eventType: "connection_sent",
      payload: { withNote: Boolean(note) },
    });
    return { sent: true };
  }

  await releaseSlot();

  if (result.error === ERRORS.ALREADY_CONNECTED) {
    await markConnected(lead, campaign, account._id);
    return { skipped: true, reason: "already_connected" };
  }
  if (result.error === ERRORS.ALREADY_PENDING) {
    lead.status = "connection_sent";
    lead.connectionSentAt = lead.connectionSentAt || new Date();
    await lead.save();
    return skip(ctx, "already_pending");
  }
  if (result.error === ERRORS.CONNECT_UNAVAILABLE) {
    lead.status = "skipped";
    lead.skipReason = "connect_unavailable";
    await lead.save();
    return skip(ctx, "connect_unavailable");
  }
  if (result.flagged) return skip(ctx, "account_flagged", { error: result.error });
  // A proxy outage is our infrastructure failing, not the lead: keep the lead pending for a later run.
  if (result.error === ERRORS.PROXY_FAILED) throw new Error(`Connection request failed: ${ERRORS.PROXY_FAILED}`);

  const attempts = job.opts?.attempts || 1;
  if ((job.attemptsMade || 0) + 1 >= attempts) {
    lead.status = "skipped";
    lead.skipReason = `send_failed:${result.error || "unknown"}`;
    await lead.save();
    return skip(ctx, "send_failed", { error: result.error });
  }
  throw new Error(`Connection request failed: ${result.error || "unknown"}`);
}

export function createConnectionWorker() {
  return new Worker(QUEUE_NAMES.connection, processConnectionJob, {
    connection: getRedis(),
    concurrency: 1,
  });
}
