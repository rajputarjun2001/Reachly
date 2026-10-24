import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

export const LEAD_STATUSES = [
  "pending",
  "connection_sent",
  "connected",
  "msg1_sent",
  "msg2_sent",
  "msg3_sent",
  "replied",
  "skipped",
  "blacklisted",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const leadSchema = new Schema(
  {
    listId: { type: Schema.Types.ObjectId, ref: "LeadList", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    linkedinUrl: { type: String, required: true },
    firstName: String,
    lastName: String,
    email: String,
    company: String,
    companyDomain: String,
    title: String,
    source: { type: String, default: "csv_import" },
    status: { type: String, enum: LEAD_STATUSES, default: "pending" },
    connectionSentAt: Date,
    connectedAt: Date,
    msg1SentAt: Date,
    msg2SentAt: Date,
    msg3SentAt: Date,
    repliedAt: Date,
    lastAcceptanceCheckAt: Date,
    skipReason: String,
  },
  { timestamps: true },
);

leadSchema.index({ workspaceId: 1 });
leadSchema.index({ listId: 1, status: 1 });
leadSchema.index({ listId: 1, linkedinUrl: 1 }, { unique: true });
leadSchema.index({ workspaceId: 1, linkedinUrl: 1 });

export type LeadFields = InferSchemaType<typeof leadSchema>;
export type LeadDoc = HydratedDocument<LeadFields>;
export const Lead = (models.Lead as Model<LeadFields>) || model("Lead", leadSchema);
