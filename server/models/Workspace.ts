import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

export const PLAN_DAILY_LIMIT = { starter: 10, growth: 50 } as const;
export type WorkspacePlan = keyof typeof PLAN_DAILY_LIMIT;

const hour = { type: Number, min: 0, max: 24 };

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, trim: true, lowercase: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    plan: { type: String, enum: Object.keys(PLAN_DAILY_LIMIT), default: "starter" },
    dailyLimitPerAccount: { type: Number, default: 10, min: 1 },
    sendingWindowStart: { ...hour, default: 8 },
    sendingWindowEnd: { ...hour, default: 20 },
    sendOnWeekends: { type: Boolean, default: false },
    /** IANA timezone used to evaluate sending windows and daily limits. */
    timezone: { type: String, default: "UTC" },
  },
  { timestamps: true },
);

workspaceSchema.index({ ownerId: 1 });

export type WorkspaceFields = InferSchemaType<typeof workspaceSchema>;
export type WorkspaceDoc = HydratedDocument<WorkspaceFields>;
export const Workspace = (models.Workspace as Model<WorkspaceFields>) || model("Workspace", workspaceSchema);
