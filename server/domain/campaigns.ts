import {
  Campaign,
  Lead,
  LeadList,
  LinkedInAccount,
  MAX_MESSAGE_STEPS,
  type CampaignDoc,
  type CampaignStatusValue,
} from "../models";
import { AppError, badRequest, conflict, notFound, unprocessable } from "../utils/errors";
import { escapeRegex } from "../utils/helpers";
import { isValidTimezone } from "../utils/schedule";
import { ensureInboxPoll, scheduleDailyConnections, scheduleDueMessages } from "../services/scheduler/dailyScheduler";
import { oid, type AuthContext } from "./context";

export type MessageStepInput = { step: number; delayDays: number; body: string; label?: string | null };
export type CampaignSettingsInput = { goal?: string | null; timezone?: string | null; dailyLimit?: number | null };

export type CampaignInput = {
  name?: unknown;
  description?: unknown;
  linkedinAccountId?: string | null;
  leadListId?: string | null;
  connectionNote?: unknown;
  connectionLabel?: unknown;
  messages?: MessageStepInput[];
  settings?: CampaignSettingsInput;
};

export function validateMessages(messages: unknown): asserts messages is MessageStepInput[] | undefined {
  if (messages === undefined) return;
  if (!Array.isArray(messages)) throw badRequest("messages must be an array");
  if (messages.length > MAX_MESSAGE_STEPS) {
    throw badRequest(`A campaign supports at most ${MAX_MESSAGE_STEPS} follow-up messages`);
  }
  const steps = messages.map((m) => Number(m?.step)).sort((a, b) => a - b);
  if (steps.some((s, i) => s !== i + 1)) throw badRequest("Message steps must be numbered 1..N without gaps");
  for (const m of messages) {
    if (!m.body || !String(m.body).trim()) throw badRequest(`Message step ${m.step} needs a body`);
    const delay = Number(m.delayDays);
    if (!Number.isInteger(delay) || delay < 0 || delay > 60) {
      throw badRequest(`Message step ${m.step} needs a delay between 0 and 60 days`);
    }
  }
}

function validateNote(note: unknown) {
  if (note !== undefined && note !== null && String(note).length > 280) {
    throw badRequest("Connection note must be 280 characters or fewer");
  }
}

function validateSettings(settings: CampaignSettingsInput | undefined) {
  if (!settings) return;
  if (settings.timezone && !isValidTimezone(settings.timezone)) throw badRequest("Invalid timezone");
  if (settings.dailyLimit !== undefined && settings.dailyLimit !== null) {
    const n = Number(settings.dailyLimit);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw badRequest("Daily limit must be between 1 and 100");
  }
}

async function assertRefs(ctx: AuthContext, input: Pick<CampaignInput, "linkedinAccountId" | "leadListId">) {
  if (input.linkedinAccountId) {
    const exists = await LinkedInAccount.exists({ _id: oid(input.linkedinAccountId, "linkedinAccountId"), workspaceId: ctx.workspaceId });
    if (!exists) throw notFound("LinkedIn account not found");
  }
  if (input.leadListId) {
    const exists = await LeadList.exists({ _id: oid(input.leadListId, "leadListId"), workspaceId: ctx.workspaceId });
    if (!exists) throw notFound("Lead list not found");
  }
}

export async function findCampaign(ctx: AuthContext, id: string): Promise<CampaignDoc> {
  const campaign = await Campaign.findOne({ _id: oid(id, "campaign id"), workspaceId: ctx.workspaceId });
  if (!campaign) throw notFound("Campaign not found");
  return campaign;
}

function normalizeMessages(messages: MessageStepInput[]) {
  return messages
    .map((m) => ({
      step: Number(m.step),
      delayDays: Number(m.delayDays),
      body: String(m.body).trim(),
      label: m.label ? String(m.label).trim() : undefined,
    }))
    .sort((a, b) => a.step - b.step);
}

export async function createCampaign(ctx: AuthContext, input: CampaignInput) {
  const name = String(input.name ?? "").trim();
  if (!name) throw badRequest("Campaign name is required");
  validateNote(input.connectionNote);
  validateMessages(input.messages);
  validateSettings(input.settings);
  await assertRefs(ctx, input);

  return Campaign.create({
    workspaceId: ctx.workspaceId,
    createdBy: ctx.userId,
    name,
    description: input.description ? String(input.description).trim() : null,
    linkedinAccountId: input.linkedinAccountId || null,
    leadListId: input.leadListId || null,
    connectionNote: input.connectionNote ? String(input.connectionNote) : "",
    connectionLabel: input.connectionLabel ? String(input.connectionLabel) : undefined,
    messages: normalizeMessages(input.messages || []),
    settings: {
      goal: input.settings?.goal || null,
      timezone: input.settings?.timezone || null,
      dailyLimit: input.settings?.dailyLimit ?? null,
    },
    status: "draft",
  });
}

export async function listCampaigns(ctx: AuthContext, opts: { status?: string | string[]; search?: string } = {}) {
  const filter: Record<string, unknown> = { workspaceId: ctx.workspaceId };
  if (opts.status) filter.status = Array.isArray(opts.status) ? { $in: opts.status } : String(opts.status);
  if (opts.search?.trim()) filter.name = new RegExp(escapeRegex(opts.search.trim()), "i");
  return Campaign.find(filter)
    .sort({ createdAt: -1 })
    .populate("linkedinAccountId", "fullName linkedinEmail label status")
    .populate("leadListId", "name totalLeads");
}

export async function leadStatusCounts(listId: unknown): Promise<Record<string, number>> {
  if (!listId) return {};
  const counts = await Lead.aggregate<{ _id: string; count: number }>([
    { $match: { listId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(counts.map((c) => [c._id, c.count]));
}

export async function campaignDetail(ctx: AuthContext, id: string) {
  const campaign = await findCampaign(ctx, id);
  const counts = await leadStatusCounts(campaign.leadListId);
  await campaign.populate([
    { path: "linkedinAccountId", select: "fullName linkedinEmail label status" },
    { path: "leadListId", select: "name totalLeads" },
  ]);
  return { campaign, leadStatusCounts: counts };
}

const LOCKED_STATUSES: CampaignStatusValue[] = ["completed", "cancelled", "archived", "failed"];

export async function updateCampaign(ctx: AuthContext, id: string, input: CampaignInput) {
  const campaign = await findCampaign(ctx, id);
  if (LOCKED_STATUSES.includes(campaign.status as CampaignStatusValue)) {
    throw conflict(`${campaign.status} campaigns cannot be edited`);
  }
  const draftOnly = (["linkedinAccountId", "leadListId"] as const).filter((k) => input[k] !== undefined);
  const changingRefs = draftOnly.filter((k) => String(input[k] ?? "") !== String(campaign[k] ?? ""));
  if (changingRefs.length && campaign.status !== "draft") {
    throw conflict(`${changingRefs.join(", ")} can only be changed while the campaign is a draft`);
  }
  validateNote(input.connectionNote);
  validateMessages(input.messages);
  validateSettings(input.settings);
  await assertRefs(ctx, input);

  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw badRequest("Campaign name is required");
    campaign.name = name;
  }
  if (input.description !== undefined) campaign.description = input.description ? String(input.description).trim() : null;
  if (input.connectionNote !== undefined) campaign.connectionNote = String(input.connectionNote ?? "");
  if (input.connectionLabel !== undefined) campaign.connectionLabel = input.connectionLabel ? String(input.connectionLabel) : undefined;
  if (input.messages !== undefined) campaign.set("messages", normalizeMessages(input.messages));
  if (input.linkedinAccountId !== undefined) campaign.set("linkedinAccountId", input.linkedinAccountId || null);
  if (input.leadListId !== undefined) campaign.set("leadListId", input.leadListId || null);
  if (input.settings) {
    if (input.settings.goal !== undefined) campaign.set("settings.goal", input.settings.goal || null);
    if (input.settings.timezone !== undefined) campaign.set("settings.timezone", input.settings.timezone || null);
    if (input.settings.dailyLimit !== undefined) campaign.set("settings.dailyLimit", input.settings.dailyLimit ?? null);
  }
  await campaign.save();
  return campaign;
}

async function startScheduling(campaign: CampaignDoc) {
  const connections = await scheduleDailyConnections(campaign);
  const messages = await scheduleDueMessages(campaign);
  if (campaign.linkedinAccountId) await ensureInboxPoll(campaign.linkedinAccountId);
  return { connections, messages };
}

async function assertAccountActive(ctx: AuthContext, campaign: CampaignDoc, verb: string) {
  if (!campaign.linkedinAccountId) throw unprocessable(`Choose a LinkedIn account before ${verb} the campaign`);
  const account = await LinkedInAccount.findOne({ _id: campaign.linkedinAccountId, workspaceId: ctx.workspaceId });
  if (!account) throw unprocessable("The campaign's LinkedIn account no longer exists");
  if (account.status !== "active") {
    throw unprocessable(`LinkedIn account is ${account.status}; reconnect it before ${verb} the campaign`);
  }
  return account;
}

export async function launchCampaign(ctx: AuthContext, id: string) {
  const campaign = await findCampaign(ctx, id);
  if (campaign.status !== "draft") throw conflict(`Campaign is ${campaign.status}; only drafts can be launched`);
  await assertAccountActive(ctx, campaign, "launching");
  if (!campaign.leadListId) throw unprocessable("Choose a lead list before launching the campaign");

  const totalLeads = await Lead.countDocuments({ listId: campaign.leadListId });
  if (!totalLeads) throw unprocessable("Lead list has no leads");
  const clash = await Campaign.exists({
    _id: { $ne: campaign._id },
    leadListId: campaign.leadListId,
    status: { $in: ["active", "paused"] },
  });
  if (clash) throw conflict("Another active or paused campaign is already using this lead list");

  campaign.status = "active";
  campaign.launchedAt = new Date();
  campaign.set("stats.totalLeads", totalLeads);
  campaign.lastScheduledFor = undefined;
  await campaign.save();

  try {
    const scheduled = await startScheduling(campaign);
    return { campaign, scheduled };
  } catch (err) {
    campaign.status = "draft";
    campaign.launchedAt = undefined;
    await campaign.save();
    throw schedulingError(err);
  }
}

/** Wraps queue failures (usually Redis being down) in a user-facing error. */
function schedulingError(cause: unknown) {
  return new AppError(503, `Could not schedule outreach (is Redis running?): ${(cause as Error).message}`);
}

export async function pauseCampaign(ctx: AuthContext, id: string, reason = "manual") {
  const campaign = await findCampaign(ctx, id);
  if (campaign.status !== "active") throw conflict(`Campaign is ${campaign.status}; only active campaigns can be paused`);
  campaign.status = "paused";
  campaign.pausedReason = reason;
  await campaign.save();
  return campaign;
}

export async function resumeCampaign(ctx: AuthContext, id: string) {
  const campaign = await findCampaign(ctx, id);
  if (campaign.status !== "paused") throw conflict(`Campaign is ${campaign.status}; only paused campaigns can be resumed`);
  await assertAccountActive(ctx, campaign, "resuming");
  campaign.status = "active";
  campaign.pausedReason = undefined;
  campaign.lastScheduledFor = undefined;
  await campaign.save();
  try {
    const scheduled = await startScheduling(campaign);
    return { campaign, scheduled };
  } catch (err) {
    campaign.status = "paused";
    await campaign.save();
    throw schedulingError(err);
  }
}

export async function cancelCampaign(ctx: AuthContext, id: string) {
  const campaign = await findCampaign(ctx, id);
  if (!["active", "paused"].includes(campaign.status)) {
    throw conflict(`Campaign is ${campaign.status}; only running or paused campaigns can be cancelled`);
  }
  campaign.status = "cancelled";
  campaign.completedAt = new Date();
  await campaign.save();
  return campaign;
}

export async function archiveCampaign(ctx: AuthContext, id: string) {
  const campaign = await findCampaign(ctx, id);
  if (campaign.status === "archived") return campaign;
  campaign.status = "archived";
  await campaign.save();
  return campaign;
}

/** Applies a status requested from the UI by dispatching to the matching lifecycle operation. */
export async function transitionCampaign(ctx: AuthContext, id: string, status: string) {
  const campaign = await findCampaign(ctx, id);
  switch (status) {
    case "active":
      if (campaign.status === "draft") return (await launchCampaign(ctx, id)).campaign;
      if (campaign.status === "paused") return (await resumeCampaign(ctx, id)).campaign;
      throw conflict(`A ${campaign.status} campaign cannot be started`);
    case "paused":
      return pauseCampaign(ctx, id);
    case "cancelled":
      return cancelCampaign(ctx, id);
    case "archived":
      return archiveCampaign(ctx, id);
    default:
      throw badRequest(`Unsupported status: ${status}`);
  }
}

export async function deleteCampaign(ctx: AuthContext, id: string) {
  const campaign = await findCampaign(ctx, id);
  if (campaign.status === "active") throw conflict("Pause the campaign before deleting it");
  await campaign.deleteOne();
  return { id: String(campaign._id) };
}
