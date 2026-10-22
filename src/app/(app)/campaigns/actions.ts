"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import {
  createCampaignDraft,
  deleteCampaign,
  replaceCampaignSteps,
  updateCampaign,
  CampaignDataError,
} from "@/lib/campaigns/repository";
import { DEFAULT_CAMPAIGN_STEPS } from "@/lib/campaigns/constants";
import type { CampaignSettings } from "@/lib/campaigns/types";
import { validateStepsInput } from "@/lib/campaigns/validation";
import { listLeadLists } from "@/lib/leads/repository";

export type CampaignActionResult = {
  error?: string;
  success?: string;
  campaignId?: string;
};

function mapError(err: unknown): string {
  if (err instanceof CampaignDataError) return err.message;
  return "Something went wrong. Please try again.";
}

export async function createCampaignAction(formData: FormData): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };

  const name = String(formData.get("name") ?? "").trim();
  const leadListId = String(formData.get("lead_list_id") ?? "") || null;
  const goal = String(formData.get("goal") ?? "").trim();
  const dailyLimit = Number(formData.get("daily_limit") ?? 10);
  const timezone = String(formData.get("timezone") ?? "Asia/Kolkata").trim();

  const settings: CampaignSettings = {
    goal: goal || null,
    daily_limit: Number.isFinite(dailyLimit) ? dailyLimit : 10,
    timezone: timezone || "Asia/Kolkata",
    account_label: null,
  };

  const stepsJson = String(formData.get("steps_json") ?? "");
  let steps: Parameters<typeof createCampaignDraft>[0]["steps"] = [...DEFAULT_CAMPAIGN_STEPS];
  if (stepsJson) {
    try {
      const parsed = JSON.parse(stepsJson) as unknown;
      if (Array.isArray(parsed)) {
        const validated = validateStepsInput(parsed as Parameters<typeof validateStepsInput>[0]);
        if (!validated) return { error: "Invalid sequence configuration." };
        steps = validated;
      }
    } catch {
      return { error: "Invalid sequence configuration." };
    }
  }

  try {
    const campaign = await createCampaignDraft({
      name,
      lead_list_id: leadListId,
      settings,
      steps,
    });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaign.id}`);
    return { success: "Campaign draft created.", campaignId: campaign.id };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function updateCampaignStatusAction(
  campaignId: string,
  status: string,
): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await updateCampaign(campaignId, { status });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: "Campaign updated." };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function renameCampaignAction(
  campaignId: string,
  name: string,
): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await updateCampaign(campaignId, { name });
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: "Campaign renamed." };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function saveCampaignStepsAction(
  campaignId: string,
  stepsJson: string,
): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const parsed = JSON.parse(stepsJson) as unknown;
    if (!Array.isArray(parsed)) return { error: "Invalid steps." };
    const validated = validateStepsInput(parsed as Parameters<typeof validateStepsInput>[0]);
    if (!validated) return { error: "Invalid sequence steps." };
    await replaceCampaignSteps(campaignId, validated);
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: "Sequence saved." };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function getLeadListsForCampaignAction(): Promise<{
  error?: string;
  lists?: { id: string; name: string; lead_count: number }[];
}> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const lists = await listLeadLists();
    return {
      lists: lists.map((l) => ({ id: l.id, name: l.name, lead_count: l.lead_count })),
    };
  } catch {
    return { error: "Could not load lead lists." };
  }
}

export async function deleteCampaignAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await deleteCampaign(campaignId);
    revalidatePath("/campaigns");
    return { success: "Campaign deleted." };
  } catch (err) {
    return { error: mapError(err) };
  }
}
