import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

export const CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
  "cancelled",
  "failed",
] as const;
export type CampaignStatusValue = (typeof CAMPAIGN_STATUSES)[number];

export const MAX_MESSAGE_STEPS = 3;

const messageStepSchema = new Schema(
  {
    step: { type: Number, required: true, min: 1, max: MAX_MESSAGE_STEPS },
    delayDays: { type: Number, required: true, min: 0, max: 60 },
    body: { type: String, required: true, maxlength: 8000 },
    label: { type: String, trim: true, maxlength: 120 },
  },
  { _id: false },
);

const statsField = { type: Number, default: 0 };

const campaignSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    /** Required to launch; drafts may be saved without one. */
    linkedinAccountId: { type: Schema.Types.ObjectId, ref: "LinkedInAccount", default: null },
    leadListId: { type: Schema.Types.ObjectId, ref: "LeadList", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: null },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "draft" },
    connectionNote: { type: String, maxlength: 280, default: "" },
    connectionLabel: { type: String, trim: true, maxlength: 120 },
    messages: {
      type: [messageStepSchema],
      default: [],
      validate: {
        validator(steps: { step: number }[]) {
          const nums = steps.map((s) => s.step);
          return new Set(nums).size === nums.length;
        },
        message: "Message steps must be unique",
      },
    },
    settings: {
      goal: { type: String, trim: true, default: null },
      timezone: { type: String, default: null },
      /** Optional per-campaign cap on new connection requests per day. */
      dailyLimit: { type: Number, min: 1, max: 100, default: null },
    },
    stats: {
      totalLeads: statsField,
      connectionsSent: statsField,
      connectionsAccepted: statsField,
      msg1Sent: statsField,
      msg2Sent: statsField,
      msg3Sent: statsField,
      replied: statsField,
    },
    /** Local day (YYYYMMDD) for which connection requests were last scheduled. */
    lastScheduledFor: String,
    launchedAt: Date,
    completedAt: Date,
    pausedReason: String,
  },
  { timestamps: true },
);

campaignSchema.index({ workspaceId: 1 });
campaignSchema.index({ status: 1, linkedinAccountId: 1 });

export type CampaignFields = InferSchemaType<typeof campaignSchema>;
export type CampaignDoc = HydratedDocument<CampaignFields>;
export const Campaign = (models.Campaign as Model<CampaignFields>) || model("Campaign", campaignSchema);
