import { Schema, model, models, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";

const leadListSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, default: null },
    totalLeads: { type: Number, default: 0 },
    uploadedAt: Date,
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

leadListSchema.index({ workspaceId: 1 });

export type LeadListFields = InferSchemaType<typeof leadListSchema>;
export type LeadListDoc = HydratedDocument<LeadListFields>;
export const LeadList = (models.LeadList as Model<LeadListFields>) || model("LeadList", leadListSchema);
