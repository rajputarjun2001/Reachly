import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

const internalNoteSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", default: null },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    kind: { type: String, enum: ["note", "draft"], default: "note" },
    body: { type: String, required: true, maxlength: 8000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

internalNoteSchema.index({ workspaceId: 1, leadId: 1 });
internalNoteSchema.index({ workspaceId: 1, conversationId: 1 });

export type InternalNoteFields = InferSchemaType<typeof internalNoteSchema>;
export type InternalNoteDoc = HydratedDocument<InternalNoteFields>;
export const InternalNote =
  (models.InternalNote as Model<InternalNoteFields>) || model("InternalNote", internalNoteSchema);
