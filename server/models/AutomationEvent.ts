import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

export const EVENT_TYPES = [
  "connection_sent",
  "connection_accepted",
  "msg1_sent",
  "msg2_sent",
  "msg3_sent",
  "msg_sent_manual",
  "reply_received",
  "job_skipped",
  "account_flagged",
  "session_refreshed",
  "health_check",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const automationEventSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    linkedinAccountId: { type: Schema.Types.ObjectId, ref: "LinkedInAccount" },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign" },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead" },
    eventType: { type: String, enum: EVENT_TYPES, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

automationEventSchema.index({ workspaceId: 1 });
automationEventSchema.index({ workspaceId: 1, createdAt: 1 });
automationEventSchema.index({ workspaceId: 1, eventType: 1, createdAt: 1 });

export type AutomationEventFields = InferSchemaType<typeof automationEventSchema>;
export type AutomationEventDoc = HydratedDocument<AutomationEventFields>;
export const AutomationEvent =
  (models.AutomationEvent as Model<AutomationEventFields>) || model("AutomationEvent", automationEventSchema);
