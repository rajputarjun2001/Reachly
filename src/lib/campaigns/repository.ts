import "server-only";

import * as campaignsDomain from "@server/domain/campaigns";
import type { CampaignDoc } from "@server/models";
import { badRequest } from "@server/utils/errors";
import { ensureDb } from "@/lib/server/backend";
import { requireAuthContext } from "@/lib/workspace/context";
import type {
  CampaignListFilter,
  CampaignRow,
  CampaignSettings,
  CampaignStatus,
  CampaignSummary,
  CampaignWithSteps,
} from "./types";
import {
  sequenceToSteps,
  stepsToSequence,
  validateCampaignName,
  validateStepsInput,
  type StepInput,
} from "./validation";

type PopulatedRef = { _id: unknown; name?: string; totalLeads?: number; label?: string; fullName?: string; linkedinEmail?: string } | null;

function refId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "object" && "_id" in value) return String((value as { _id: unknown })._id);
  return String(value);
}

function asPopulated(value: unknown): PopulatedRef {
  return value && typeof value === "object" && "_id" in value ? (value as PopulatedRef) : null;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value ?? Date.now())).toISOString();
}

export function mapCampaignRow(doc: CampaignDoc): CampaignRow {
  const stats = doc.stats ?? {
    totalLeads: 0,
    connectionsSent: 0,
    connectionsAccepted: 0,
    msg1Sent: 0,
    msg2Sent: 0,
    msg3Sent: 0,
    replied: 0,
  };
  return {
    id: String(doc._id),
    workspace_id: String(doc.workspaceId),
    name: doc.name,
    description: doc.description ?? null,
    status: doc.status as CampaignStatus,
    lead_list_id: refId(doc.leadListId),
    linkedin_account_id: refId(doc.linkedinAccountId),
    settings: {
      goal: doc.settings?.goal ?? null,
      daily_limit: doc.settings?.dailyLimit ?? null,
      timezone: doc.settings?.timezone ?? null,
    },
    stats: {
      total_leads: stats.totalLeads ?? 0,
      connections_sent: stats.connectionsSent ?? 0,
      connections_accepted: stats.connectionsAccepted ?? 0,
      messages_sent: (stats.msg1Sent ?? 0) + (stats.msg2Sent ?? 0) + (stats.msg3Sent ?? 0),
      replied: stats.replied ?? 0,
    },
    paused_reason: doc.pausedReason ?? null,
    launched_at: doc.launchedAt ? iso(doc.launchedAt) : null,
    created_by: doc.createdBy ? String(doc.createdBy) : null,
    created_at: iso(doc.get("createdAt")),
    updated_at: iso(doc.get("updatedAt")),
  };
}

function mapSummary(doc: CampaignDoc): CampaignSummary {
  const list = asPopulated(doc.leadListId);
  const account = asPopulated(doc.linkedinAccountId);
  return {
    ...mapCampaignRow(doc),
    lead_list_name: list?.name ?? null,
    linkedin_account_label: account ? account.label || account.fullName || account.linkedinEmail || null : null,
    lead_count: list?.totalLeads ?? 0,
    step_count: 1 + (doc.messages?.length ?? 0),
  };
}

async function scoped() {
  const ctx = await requireAuthContext();
  await ensureDb();
  return ctx;
}

const FILTER_STATUSES: Record<CampaignListFilter, string[] | undefined> = {
  all: undefined,
  active: ["active", "paused"],
  draft: ["draft"],
  archived: ["archived", "completed", "cancelled", "failed"],
};

export async function listCampaigns(options?: {
  filter?: CampaignListFilter;
  search?: string;
}): Promise<CampaignSummary[]> {
  const ctx = await scoped();
  const docs = await campaignsDomain.listCampaigns(ctx, {
    status: FILTER_STATUSES[options?.filter ?? "all"],
    search: options?.search,
  });
  return docs.map((d) => mapSummary(d as CampaignDoc));
}

export async function getCampaignById(campaignId: string): Promise<CampaignWithSteps | null> {
  const ctx = await scoped();
  try {
    const { campaign, leadStatusCounts } = await campaignsDomain.campaignDetail(ctx, campaignId);
    const summary = mapSummary(campaign);
    return {
      ...summary,
      steps: sequenceToSteps(summary, {
        connectionNote: campaign.connectionNote ?? "",
        connectionLabel: campaign.connectionLabel ?? null,
        messages: (campaign.messages ?? []).map((m) => ({
          step: m.step,
          delayDays: m.delayDays,
          body: m.body,
          label: m.label ?? null,
        })),
      }),
      lead_status_counts: leadStatusCounts,
    };
  } catch (err) {
    if ((err as { status?: number }).status === 404 || (err as { status?: number }).status === 400) return null;
    throw err;
  }
}

function toSettingsInput(settings: CampaignSettings | undefined) {
  if (!settings) return undefined;
  return {
    goal: settings.goal ?? null,
    timezone: settings.timezone ?? null,
    dailyLimit: settings.daily_limit ?? null,
  };
}

export async function createCampaignDraft(input: {
  name: string;
  description?: string | null;
  lead_list_id?: string | null;
  linkedin_account_id?: string | null;
  settings?: CampaignSettings;
  steps: StepInput[];
}): Promise<CampaignRow> {
  const ctx = await scoped();
  const name = validateCampaignName(input.name);
  if (!name) throw badRequest("Invalid campaign name");
  const steps = validateStepsInput(input.steps);
  if (!steps) throw badRequest("Invalid sequence steps");

  const doc = await campaignsDomain.createCampaign(ctx, {
    name,
    description: input.description ?? null,
    leadListId: input.lead_list_id ?? null,
    linkedinAccountId: input.linkedin_account_id ?? null,
    settings: toSettingsInput(input.settings),
    ...stepsToSequence(steps),
  });
  return mapCampaignRow(doc);
}

export async function updateCampaign(
  campaignId: string,
  input: {
    name?: string;
    description?: string | null;
    lead_list_id?: string | null;
    linkedin_account_id?: string | null;
    settings?: CampaignSettings;
  },
): Promise<CampaignRow> {
  const ctx = await scoped();
  const doc = await campaignsDomain.updateCampaign(ctx, campaignId, {
    name: input.name,
    description: input.description,
    leadListId: input.lead_list_id,
    linkedinAccountId: input.linkedin_account_id,
    settings: toSettingsInput(input.settings),
  });
  return mapCampaignRow(doc);
}

export async function replaceCampaignSteps(campaignId: string, steps: StepInput[]): Promise<void> {
  const ctx = await scoped();
  const validated = validateStepsInput(steps);
  if (!validated) throw badRequest("Invalid sequence steps");
  await campaignsDomain.updateCampaign(ctx, campaignId, stepsToSequence(validated));
}

export async function transitionCampaign(campaignId: string, status: string): Promise<CampaignRow> {
  const ctx = await scoped();
  return mapCampaignRow(await campaignsDomain.transitionCampaign(ctx, campaignId, status));
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const ctx = await scoped();
  await campaignsDomain.deleteCampaign(ctx, campaignId);
}
