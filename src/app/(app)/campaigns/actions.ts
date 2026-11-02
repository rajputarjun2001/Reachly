"use server";

import { revalidatePath } from "next/cache";
import { isBackendConfigured } from "@/lib/env";
import {
  createCampaignDraft,
  deleteCampaign,
  replaceCampaignSteps,
  transitionCampaign,
  updateCampaign,
  sendConnectionNow,
} from "@/lib/campaigns/repository";
import { DEFAULT_CAMPAIGN_STEPS } from "@/lib/campaigns/constants";
import type { CampaignSettings } from "@/lib/campaigns/types";
import { validateStepsInput, type StepInput } from "@/lib/campaigns/validation";
import { listLeadLists } from "@/lib/leads/repository";
import { listAccounts } from "@/lib/accounts/repository";
import type { AccountOption } from "@/lib/accounts/types";
import { actionErrorMessage } from "@/lib/server/backend";

export type CampaignActionResult = {
  error?: string;
  success?: string;
  campaignId?: string;
};

const NOT_CONFIGURED = { error: "Backend is not configured." };

function revalidateCampaign(campaignId?: string) {
  revalidatePath("/campaigns");
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
}

function parseSteps(stepsJson: string): StepInput[] | null {
  try {
    const parsed = JSON.parse(stepsJson) as unknown;
    return Array.isArray(parsed) ? validateStepsInput(parsed as StepInput[]) : null;
  } catch {
    return null;
  }
}

export async function createCampaignAction(formData: FormData): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;

  const name = String(formData.get("name") ?? "").trim();
  const leadListId = String(formData.get("lead_list_id") ?? "") || null;
  const accountId = String(formData.get("linkedin_account_id") ?? "") || null;
  const goal = String(formData.get("goal") ?? "").trim();
  const dailyLimit = Number(formData.get("daily_limit") ?? 10);
  const timezone = String(formData.get("timezone") ?? "").trim();

  const settings: CampaignSettings = {
    goal: goal || null,
    daily_limit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : null,
    timezone: timezone || null,
  };

  const stepsJson = String(formData.get("steps_json") ?? "");
  const steps = stepsJson ? parseSteps(stepsJson) : [...DEFAULT_CAMPAIGN_STEPS];
  if (!steps) {
    return { error: "Invalid sequence. Start with a connection request followed by up to 3 messages." };
  }

  try {
    const campaign = await createCampaignDraft({
      name,
      lead_list_id: leadListId,
      linkedin_account_id: accountId,
      settings,
      steps,
    });
    revalidateCampaign(campaign.id);
    return { success: "Campaign draft created.", campaignId: campaign.id };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function updateCampaignStatusAction(
  campaignId: string,
  status: string,
): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await transitionCampaign(campaignId, status);
    revalidateCampaign(campaignId);
    return { success: "Campaign updated." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function renameCampaignAction(
  campaignId: string,
  name: string,
): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await updateCampaign(campaignId, { name });
    revalidateCampaign(campaignId);
    return { success: "Campaign renamed." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function updateCampaignAccountAction(
  campaignId: string,
  accountId: string,
): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await updateCampaign(campaignId, { linkedin_account_id: accountId || null });
    revalidateCampaign(campaignId);
    return { success: "LinkedIn account updated." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function saveCampaignStepsAction(
  campaignId: string,
  stepsJson: string,
): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const steps = parseSteps(stepsJson);
  if (!steps) return { error: "Invalid sequence. Every follow-up message needs text." };
  try {
    await replaceCampaignSteps(campaignId, steps);
    revalidateCampaign(campaignId);
    return { success: "Sequence saved." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function getLeadListsForCampaignAction(): Promise<{
  error?: string;
  lists?: { id: string; name: string; lead_count: number }[];
}> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const lists = await listLeadLists();
    return {
      lists: lists.map((l) => ({ id: l.id, name: l.name, lead_count: l.lead_count })),
    };
  } catch {
    return { error: "Could not load lead lists." };
  }
}

export async function getAccountsForCampaignAction(): Promise<{ error?: string; accounts?: AccountOption[] }> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const accounts = await listAccounts();
    return {
      accounts: accounts.map((a) => ({ id: a.id, label: a.display_name, status: a.status, daily_limit: a.daily_limit })),
    };
  } catch {
    return { error: "Could not load LinkedIn accounts." };
  }
}

export async function startCampaignAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await transitionCampaign(campaignId, "active");
    revalidateCampaign(campaignId);
    return { success: "Campaign started. Connection requests are scheduled inside the sending window." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function pauseCampaignAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await transitionCampaign(campaignId, "paused");
    revalidateCampaign(campaignId);
    return { success: "Campaign paused. Queued sends will be skipped." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function resumeCampaignAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await transitionCampaign(campaignId, "active");
    revalidateCampaign(campaignId);
    return { success: "Campaign resumed." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function cancelCampaignAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await transitionCampaign(campaignId, "cancelled");
    revalidateCampaign(campaignId);
    return { success: "Campaign cancelled." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function deleteCampaignAction(campaignId: string): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await deleteCampaign(campaignId);
    revalidateCampaign();
    return { success: "Campaign deleted." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function sendConnectionNowAction(
  campaignId: string,
  leadId: string,
): Promise<CampaignActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await sendConnectionNow(campaignId, leadId);
    revalidateCampaign(campaignId);
    return {
      success: "Connection request queued. Refresh in a few seconds to see the updated lead status.",
    };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}
