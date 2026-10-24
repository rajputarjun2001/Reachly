import { Worker } from "bullmq";
import type { Types } from "mongoose";
import {
  Campaign,
  Conversation,
  Lead,
  LinkedInAccount,
  Workspace,
  previewOf,
  type LeadStatus,
} from "../../models";
import { getRedis } from "../../config/redis";
import { QUEUE_NAMES } from "./queueNames";
import * as linkedinActions from "../playwright/linkedinActions";
import { loadAccountWithSecrets, runWithSession } from "../accountSession";
import { checkLeadBlacklisted } from "../../utils/blacklist";
import { renderTemplate } from "../../utils/template";
import { HOUR, msUntilNextWindow } from "../../utils/schedule";
import { logEvent } from "../events";
import { PREVIOUS_STATUS, enqueueMessage, getStep, scheduleNextMessage } from "./sequence";
import { sendingWindowFor } from "./limits";
import type { JobLike, JobOutcome, MessageJobPayload } from "./jobTypes";

type Id = Types.ObjectId | string;
type SkipCtx = { workspaceId: Types.ObjectId; accountId: string; campaignId: string; leadId: string; messageStep: number };

async function skip(ctx: SkipCtx, reason: string, extra: Record<string, unknown> = {}): Promise<JobOutcome> {
  await logEvent({
    workspaceId: ctx.workspaceId,
    linkedinAccountId: ctx.accountId,
    campaignId: ctx.campaignId,
    leadId: ctx.leadId,
    eventType: "job_skipped",
    payload: { job: "send-message", messageStep: ctx.messageStep, reason, ...extra },
  });
  return { skipped: true, reason };
}

/** Upserts the lead's conversation thread with an outbound message. */
export async function recordSentMessage(input: {
  workspaceId: Id;
  accountId: Id;
  campaignId?: Id | null;
  lead: { _id: Id; firstName?: string | null; lastName?: string | null };
  body: string;
}) {
  const now = new Date();
  const name = [input.lead.firstName, input.lead.lastName].filter(Boolean).join(" ");
  return Conversation.findOneAndUpdate(
    { linkedinAccountId: input.accountId, leadId: input.lead._id },
    {
      $setOnInsert: { workspaceId: input.workspaceId, participantName: name, title: name || null },
      $set: {
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        lastMessageAt: now,
        lastMessagePreview: previewOf(input.body),
      },
      $push: { messages: { direction: "sent", body: input.body, sentAt: now } },
    },
    { upsert: true, returnDocument: "after" },
  );
}

export async function processMessageJob(job: JobLike<MessageJobPayload>): Promise<JobOutcome> {
  const { leadId, campaignId, accountId } = job.data;
  const messageStep = Number(job.data.messageStep);
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return { skipped: true, reason: "campaign_not_found" };
  const ctx: SkipCtx = { workspaceId: campaign.workspaceId, accountId, campaignId, leadId, messageStep };

  if (campaign.status !== "active") return skip(ctx, "campaign_not_active");
  const step = getStep(campaign, messageStep);
  if (!step) return skip(ctx, "step_not_configured");

  const lead = await Lead.findById(leadId);
  if (!lead) return skip(ctx, "lead_not_found");
  // Guards against duplicates and stops the sequence once the lead replied.
  if (lead.status !== PREVIOUS_STATUS[messageStep]) return { skipped: true, reason: `lead_status_${lead.status}` };

  const workspace = await Workspace.findById(campaign.workspaceId);
  const waitMs = msUntilNextWindow(sendingWindowFor(workspace, campaign));
  if (waitMs > 0) {
    await enqueueMessage({ leadId, campaignId, accountId, messageStep }, waitMs + Math.random() * HOUR);
    return { deferred: true, delayMs: waitMs };
  }

  const account = await loadAccountWithSecrets(accountId);
  if (!account || account.status !== "active") return skip(ctx, "account_not_active");

  const bl = await checkLeadBlacklisted(lead, campaign.workspaceId);
  if (bl.blacklisted) {
    lead.status = "blacklisted";
    lead.skipReason = bl.reason;
    await lead.save();
    return skip(ctx, "blacklisted", { match: bl.reason });
  }

  const body = renderTemplate(step.body, lead);
  const result = await runWithSession(account, (cookies, opts) =>
    linkedinActions.sendMessage(cookies, lead.linkedinUrl, body, opts),
  );

  if (result.success) {
    const now = new Date();
    lead.status = `msg${messageStep}_sent` as LeadStatus;
    lead.set(`msg${messageStep}SentAt`, now);
    await lead.save();
    await Campaign.updateOne({ _id: campaign._id }, { $inc: { [`stats.msg${messageStep}Sent`]: 1 } });
    await LinkedInAccount.updateOne({ _id: account._id }, { $set: { lastSentAt: now } });
    await recordSentMessage({
      workspaceId: campaign.workspaceId,
      accountId: account._id,
      campaignId: campaign._id,
      lead,
      body,
    });
    await logEvent({
      workspaceId: campaign.workspaceId,
      linkedinAccountId: account._id,
      campaignId: campaign._id,
      leadId: lead._id,
      eventType: `msg${messageStep}_sent` as "msg1_sent",
      payload: { messageStep },
    });
    await scheduleNextMessage(campaign, lead, now);
    return { sent: true };
  }

  if (result.flagged) return skip(ctx, "account_flagged", { error: result.error });

  const attempts = job.opts?.attempts || 1;
  if ((job.attemptsMade || 0) + 1 >= attempts) {
    lead.status = "skipped";
    lead.skipReason = `message_failed:${result.error || "unknown"}`;
    await lead.save();
    return skip(ctx, "send_failed", { error: result.error });
  }
  throw new Error(`Message send failed: ${result.error || "unknown"}`);
}

export function createMessageWorker() {
  return new Worker(QUEUE_NAMES.message, processMessageJob, {
    connection: getRedis(),
    concurrency: 1,
  });
}
