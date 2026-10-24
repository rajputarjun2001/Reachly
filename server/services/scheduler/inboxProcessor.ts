import { Worker } from "bullmq";
import type { Types } from "mongoose";
import {
  Campaign,
  Conversation,
  Lead,
  previewOf,
  type ConversationDoc,
  type LeadStatus,
  type LinkedInAccountDoc,
} from "../../models";
import { getRedis } from "../../config/redis";
import { QUEUE_NAMES } from "./queueNames";
import * as linkedinActions from "../playwright/linkedinActions";
import type { InboxConversation, InboxMessage } from "../playwright/linkedinActions";
import { loadAccountWithSecrets, runWithSession } from "../accountSession";
import { normalizeLinkedinUrl } from "../../utils/linkedinUrl";
import { logEvent } from "../events";
import { checkAcceptances } from "./acceptanceChecker";
import type { InboxJobData, JobLike } from "./jobTypes";

const CONTACTED_STATUSES: LeadStatus[] = ["connection_sent", "connected", "msg1_sent", "msg2_sent", "msg3_sent", "replied"];

function stripYouPrefix(preview: string | null | undefined) {
  return String(preview || "")
    .replace(/^you:\s*/i, "")
    .trim();
}

/** Finds the lead a scraped thread belongs to: by stored conversation, profile URL, then name. */
async function matchLead(
  account: LinkedInAccountDoc,
  scraped: InboxConversation,
  existingConversation: ConversationDoc | null,
) {
  if (existingConversation?.leadId) return Lead.findById(existingConversation.leadId);

  const listIds = (await Campaign.find({ linkedinAccountId: account._id }).select("leadListId"))
    .map((c) => c.leadListId)
    .filter((id): id is Types.ObjectId => Boolean(id));
  if (!listIds.length) return null;
  const base = { workspaceId: account.workspaceId, listId: { $in: listIds }, status: { $in: CONTACTED_STATUSES } };

  const url = normalizeLinkedinUrl(scraped.profileUrl);
  if (url) {
    const byUrl = await Lead.findOne({ ...base, linkedinUrl: url });
    if (byUrl) return byUrl;
  }

  const name = String(scraped.senderName || "").trim();
  if (!name) return null;
  const candidates = await Lead.find(base).select("firstName lastName listId status");
  const lower = name.toLowerCase();
  const matches = candidates.filter(
    (l) => [l.firstName, l.lastName].filter(Boolean).join(" ").toLowerCase() === lower,
  );
  return matches.length === 1 ? Lead.findById(matches[0]._id) : null;
}

/** Messages from the scrape that aren't already stored (compared by direction + body). */
export function newMessages(
  scraped: Pick<InboxConversation, "messages" | "preview">,
  conversation: { messages?: { direction: string; body?: string | null }[] } | null,
): InboxMessage[] {
  const stored = new Set((conversation?.messages || []).map((m) => `${m.direction}|${(m.body || "").trim()}`));
  let incoming = scraped.messages;
  if (!incoming || !incoming.length) {
    const fromUs = /^you:/i.test(scraped.preview || "");
    incoming = scraped.preview
      ? [{ direction: fromUs ? "sent" : "received", body: stripYouPrefix(scraped.preview) }]
      : [];
  }
  return incoming.filter((m) => m.body && !stored.has(`${m.direction}|${m.body.trim()}`));
}

export async function handleConversation(account: LinkedInAccountDoc, scraped: InboxConversation) {
  let conversation = await Conversation.findOne({
    linkedinAccountId: account._id,
    linkedinThreadId: scraped.threadId,
  });
  const lead = await matchLead(account, scraped, conversation);
  if (!conversation && !lead) return { ignored: true as const };

  if (!conversation && lead) {
    conversation = await Conversation.findOne({ linkedinAccountId: account._id, leadId: lead._id });
  }
  const campaign = lead
    ? await Campaign.findOne({ linkedinAccountId: account._id, leadListId: lead.listId }).sort({ createdAt: -1 })
    : null;

  if (!conversation) {
    conversation = new Conversation({
      workspaceId: account.workspaceId,
      linkedinAccountId: account._id,
      leadId: lead?._id,
      campaignId: campaign?._id,
    });
  }
  conversation.linkedinThreadId = scraped.threadId ?? undefined;
  if (scraped.senderName) {
    conversation.participantName = scraped.senderName;
    if (!conversation.title) conversation.title = scraped.senderName;
  }

  const fresh = newMessages(scraped, conversation);
  const now = new Date();
  for (const m of fresh) conversation.messages.push({ direction: m.direction, body: m.body, sentAt: now });
  const received = fresh.filter((m) => m.direction === "received");
  if (fresh.length) {
    conversation.lastMessageAt = now;
    conversation.lastMessagePreview = previewOf(fresh[fresh.length - 1].body);
  }
  if (received.length) {
    conversation.hasUnread = true;
    conversation.status = "open";
  }
  await conversation.save();

  let firstReply = false;
  if (received.length && lead && lead.status !== "replied") {
    lead.status = "replied";
    lead.repliedAt = now;
    await lead.save();
    firstReply = true;
    if (campaign) await Campaign.updateOne({ _id: campaign._id }, { $inc: { "stats.replied": 1 } });
    await logEvent({
      workspaceId: account.workspaceId,
      linkedinAccountId: account._id,
      campaignId: campaign?._id,
      leadId: lead._id,
      eventType: "reply_received",
      payload: { threadId: scraped.threadId },
    });
  }
  return { ignored: false as const, conversationId: conversation._id, newMessages: fresh.length, firstReply };
}

export async function processInboxJob(job: JobLike<InboxJobData>) {
  const { accountId } = job.data;
  const account = await loadAccountWithSecrets(accountId);
  if (!account || account.status !== "active") return { skipped: true, reason: "account_not_active" };

  const result = await runWithSession(account, (cookies, opts) => linkedinActions.scrapeInbox(cookies, opts));
  if (!result.success) {
    if (result.flagged) return { skipped: true, reason: "account_flagged" };
    throw new Error(`Inbox scrape failed: ${result.error || "unknown"}`);
  }

  const summary: {
    conversations: number;
    newMessages: number;
    replies: number;
    acceptance?: Awaited<ReturnType<typeof checkAcceptances>>;
  } = { conversations: 0, newMessages: 0, replies: 0 };
  for (const scraped of result.conversations || []) {
    if (!scraped.threadId) continue;
    const r = await handleConversation(account, scraped);
    if (r.ignored) continue;
    summary.conversations += 1;
    summary.newMessages += r.newMessages;
    if (r.firstReply) summary.replies += 1;
  }

  if (account.status === "active") summary.acceptance = await checkAcceptances(account);
  return summary;
}

export function createInboxWorker() {
  return new Worker(QUEUE_NAMES.inboxPoll, processInboxJob, {
    connection: getRedis(),
    concurrency: 1,
  });
}
