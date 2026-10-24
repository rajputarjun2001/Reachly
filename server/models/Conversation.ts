import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

export const MESSAGE_DIRECTIONS = ["sent", "received", "system"] as const;

const messageSchema = new Schema(
  {
    direction: { type: String, enum: MESSAGE_DIRECTIONS, required: true },
    body: { type: String, maxlength: 8000 },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const conversationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    linkedinAccountId: { type: Schema.Types.ObjectId, ref: "LinkedInAccount", default: null },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", default: null },
    linkedinThreadId: String,
    participantName: String,
    title: { type: String, trim: true, maxlength: 200 },
    status: { type: String, enum: ["open", "archived"], default: "open" },
    lastMessageAt: Date,
    lastMessagePreview: { type: String, default: null },
    hasUnread: { type: Boolean, default: false },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true },
);

conversationSchema.index({ workspaceId: 1 });
conversationSchema.index({ workspaceId: 1, hasUnread: 1 });
conversationSchema.index({ workspaceId: 1, lastMessageAt: -1 });
conversationSchema.index({ linkedinAccountId: 1, linkedinThreadId: 1 });
conversationSchema.index({ linkedinAccountId: 1, leadId: 1 });

export const previewOf = (body: string | null | undefined) => (body ? body.slice(0, 160) : null);

export type ConversationFields = InferSchemaType<typeof conversationSchema>;
export type ConversationDoc = HydratedDocument<ConversationFields>;
export const Conversation =
  (models.Conversation as Model<ConversationFields>) || model("Conversation", conversationSchema);
