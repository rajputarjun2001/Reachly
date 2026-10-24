import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

export const BLACKLIST_TYPES = ["domain", "profile_url"] as const;
export type BlacklistType = (typeof BLACKLIST_TYPES)[number];

const blacklistSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    type: { type: String, enum: BLACKLIST_TYPES, required: true },
    value: { type: String, required: true, lowercase: true, trim: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

blacklistSchema.index({ workspaceId: 1 });
blacklistSchema.index({ workspaceId: 1, type: 1, value: 1 }, { unique: true });

export type BlacklistFields = InferSchemaType<typeof blacklistSchema>;
export type BlacklistDoc = HydratedDocument<BlacklistFields>;
export const Blacklist = (models.Blacklist as Model<BlacklistFields>) || model("Blacklist", blacklistSchema);
