import type { Types } from "mongoose";
import { AutomationEvent, type EventType } from "../models";

type Id = Types.ObjectId | string | null | undefined;

export type LogEventInput = {
  workspaceId: Types.ObjectId | string;
  linkedinAccountId?: Id;
  campaignId?: Id;
  leadId?: Id;
  eventType: EventType;
  payload?: Record<string, unknown>;
};

export async function logEvent({
  workspaceId,
  linkedinAccountId,
  campaignId,
  leadId,
  eventType,
  payload = {},
}: LogEventInput) {
  try {
    return await AutomationEvent.create({
      workspaceId,
      linkedinAccountId: linkedinAccountId ?? undefined,
      campaignId: campaignId ?? undefined,
      leadId: leadId ?? undefined,
      eventType,
      payload,
    });
  } catch (err) {
    // Audit logging must never break the job that produced the event.
    console.error("[events] failed to log", eventType, (err as Error).message);
    return null;
  }
}
