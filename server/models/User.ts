import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

export const USER_ROLES = ["owner", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    fullName: { type: String, trim: true, default: "" },
    /** Null until the user creates (or is invited into) a workspace. */
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    role: { type: String, enum: USER_ROLES, default: "member" },
    status: { type: String, enum: ["active", "pending"], default: "active" },
    inviteToken: { type: String, select: false },
    inviteExpiresAt: { type: Date },
    timezone: { type: String, default: "UTC" },
    lastActiveAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ workspaceId: 1 });

userSchema.set("toJSON", {
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.passwordHash;
    delete ret.inviteToken;
    delete ret.__v;
    return ret;
  },
});

export type UserFields = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserFields>;
export const User = (models.User as Model<UserFields>) || model("User", userSchema);
