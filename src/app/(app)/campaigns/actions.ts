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
import {
  cancelCampaignExecution,
  getCampaignExecutionStats,
  pauseCampaignExecution,
  processDueCampaignJobs,
  resumeCampaignExecution,
  startCampaignExecution,
  CampaignExecutionError,
} from "@/lib/campaigns/execution/repository";
import type { CampaignExecutionStats } from "@/lib/campaigns/execution/types";
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
  if (err instanceof CampaignExecutionError) return err.message;
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

export async function getCampaignExecutionStatsAction(campaignId: string): Promise<{
  error?: string;
  stats?: CampaignExecutionStats;
}> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const stats = await getCampaignExecutionStats(campaignId);
    return { stats };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function startCampaignExecutionAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const result = await startCampaignExecution(campaignId);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return {
      success: `Campaign started. Enrolled ${result.enrolled} lead(s); scheduled ${result.jobsCreated} job(s). LinkedIn delivery is not configured.`,
    };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function pauseCampaignExecutionAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await pauseCampaignExecution(campaignId);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: "Campaign paused. Pending jobs will not run." };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function resumeCampaignExecutionAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await resumeCampaignExecution(campaignId);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: "Campaign resumed." };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function cancelCampaignExecutionAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await cancelCampaignExecution(campaignId);
    revalidatePath("/campaigns");
    revalidatePath(`/campaigns/${campaignId}`);
    return { success: "Campaign cancelled." };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function processDueCampaignJobsAction(campaignId?: string): Promise<CampaignActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const { claimed, processed } = await processDueCampaignJobs({ workerId: "reachly-ui-worker", limit: 25 });
    if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
    return {
      success: `Processed ${processed} of ${claimed} claimed job(s). No LinkedIn messages were sent unless a future executor is enabled.`,
    };
  } catch (err) {
    return { error: mapError(err) };
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
