import type { Types } from "mongoose";
import { getQueues } from "./queues";
import { DAY } from "../../utils/schedule";
import type { LeadStatus } from "../../models";

type Id = Types.ObjectId | string;
type StepLike = { step: number; delayDays: number; body: string };
type CampaignLike = { _id: Id; linkedinAccountId?: Id | null; messages?: StepLike[] | null };
type LeadLike = {
  _id: Id;
  status?: string | null;
  connectedAt?: Date | null;
  msg1SentAt?: Date | null;
  msg2SentAt?: Date | null;
};

/** Status a lead must be in before message step N can be sent. */
export const PREVIOUS_STATUS: Record<number, LeadStatus> = { 1: "connected", 2: "msg1_sent", 3: "msg2_sent" };
export const NEXT_STEP_FOR_STATUS: Partial<Record<string, number>> = { connected: 1, msg1_sent: 2, msg2_sent: 3 };
const STEP_BASE_FIELD = { 1: "connectedAt", 2: "msg1SentAt", 3: "msg2SentAt" } as const;

export function getStep<T extends StepLike>(campaign: { messages?: T[] | null }, stepNumber: number): T | null {
  return (campaign.messages || []).find((m) => m.step === stepNumber) || null;
}

export function nextStepNumber(lead: LeadLike): number | null {
  return (lead.status && NEXT_STEP_FOR_STATUS[lead.status]) || null;
}

/** Date at which the lead's next message becomes due, or null if the sequence is finished. */
export function nextMessageDueAt(campaign: CampaignLike, lead: LeadLike) {
  const stepNumber = nextStepNumber(lead);
  if (!stepNumber) return null;
  const step = getStep(campaign, stepNumber);
  const base = lead[STEP_BASE_FIELD[stepNumber as 1 | 2 | 3]];
  if (!step || !base) return null;
  return { stepNumber, dueAt: new Date(new Date(base).getTime() + step.delayDays * DAY) };
}

export type MessageJobData = { leadId: Id; campaignId: Id; accountId: Id; messageStep: number };

/**
 * Stable id for a lead's sequence step. The hourly scheduler re-queues anything due within a day,
 * so BullMQ must collapse those repeats into one job.
 */
export const messageJobId = (leadId: Id, messageStep: number) => `msg-${String(leadId)}-${messageStep}`;

export async function enqueueMessage(
  { leadId, campaignId, accountId, messageStep }: MessageJobData,
  delayMs = 0,
  jobId?: string,
) {
  return getQueues().messageQueue.add(
    "send-message",
    { leadId: String(leadId), campaignId: String(campaignId), accountId: String(accountId), messageStep },
    {
      ...(jobId ? { jobId } : {}),
      delay: Math.max(0, Math.round(delayMs)),
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    },
  );
}

/** Schedules the next message for a lead (if the campaign has one). Returns true when queued. */
export async function scheduleNextMessage(campaign: CampaignLike, lead: LeadLike, now = new Date()): Promise<boolean> {
  const next = nextMessageDueAt(campaign, lead);
  if (!next || !campaign.linkedinAccountId) return false;
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
  return true;
}
