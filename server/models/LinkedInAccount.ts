import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
import { encrypt, isEncrypted } from "../utils/encryption";

export const ACCOUNT_STATUSES = ["connecting", "active", "disconnected", "flagged"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const linkedInAccountSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    label: { type: String, trim: true, maxlength: 120 },
    linkedinEmail: { type: String, required: true, lowercase: true, trim: true },
    linkedinPasswordEncrypted: { type: String, select: false },
    fullName: String,
    headline: String,
    profileUrl: String,
    /** LinkedIn OIDC subject (`sub`) when connected via Sign In with LinkedIn. */
    linkedinSub: { type: String, trim: true },
    oauthAccessTokenEncrypted: { type: String, select: false },
    oauthExpiresAt: Date,
    oauthScopes: String,
    status: { type: String, enum: ACCOUNT_STATUSES, default: "connecting" },
    sessionCookies: { type: String, select: false },
    containerId: String,
    containerPort: Number,
    dailyLimit: { type: Number, default: 10, min: 1 },
    todaySentCount: { type: Number, default: 0 },
    /** Local calendar day (YYYYMMDD, workspace timezone) that todaySentCount refers to. */
    todayCountDate: String,
    lastHealthCheck: Date,
    lastSentAt: Date,
    warningCount: { type: Number, default: 0 },
    flagReason: String,
  },
  { timestamps: true },
);

linkedInAccountSchema.index({ workspaceId: 1 });
linkedInAccountSchema.index({ workspaceId: 1, linkedinEmail: 1 }, { unique: true });
linkedInAccountSchema.index(
  { workspaceId: 1, linkedinSub: 1 },
  { unique: true, partialFilterExpression: { linkedinSub: { $exists: true, $type: "string" } } },
);

linkedInAccountSchema.pre("save", function encryptPassword() {
  if (
    this.isModified("linkedinPasswordEncrypted") &&
    this.linkedinPasswordEncrypted &&
    !isEncrypted(this.linkedinPasswordEncrypted)
  ) {
    this.linkedinPasswordEncrypted = encrypt(this.linkedinPasswordEncrypted);
  }
});

linkedInAccountSchema.set("toJSON", {
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.linkedinPasswordEncrypted;
    delete ret.sessionCookies;
    delete ret.oauthAccessTokenEncrypted;
    delete ret.__v;
    return ret;
  },
});

export type LinkedInAccountFields = InferSchemaType<typeof linkedInAccountSchema>;
export type LinkedInAccountDoc = HydratedDocument<LinkedInAccountFields>;
export const LinkedInAccount =
  (models.LinkedInAccount as Model<LinkedInAccountFields>) || model("LinkedInAccount", linkedInAccountSchema);
