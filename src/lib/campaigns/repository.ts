import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import type {
  CampaignListFilter,
  CampaignRow,
  CampaignSettings,
  CampaignStepRow,
  CampaignSummary,
  CampaignWithSteps,
} from "./types";
import {
  canTransitionStatus,
  sanitizeStepConfiguration,
  validateCampaignName,
  validateCampaignStatus,
  validateStepsInput,
  type StepInput,
} from "./validation";

export class CampaignDataError extends Error {
  constructor(
    message: string,
    public code: string = "CAMPAIGN_DATA_ERROR",
  ) {
    super(message);
  }
}

async function getScopedClient() {
  const ctx = await requireWorkspaceContext();
  const supabase = await createClient();
  return { supabase, ctx };
}

function mapSchemaError(error: { code?: string; message?: string }) {
  const hint = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    hint.includes("campaigns") ||
    hint.includes("schema cache")
  ) {
    throw new CampaignDataError(
      "Campaign tables are missing in this Supabase project.",
      "SCHEMA_MISSING",
    );
  }
}

export async function listCampaigns(options?: {
  filter?: CampaignListFilter;
  search?: string;
}): Promise<CampaignSummary[]> {
  const { supabase, ctx } = await getScopedClient();

  let query = supabase
    .from("campaigns")
    .select(
      `
      id, workspace_id, name, description, status, lead_list_id, settings,
      created_by, created_at, updated_at,
      lead_lists ( name, leads ( count ) ),
      campaign_steps ( count )
    `,
    )
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false });

  const filter = options?.filter ?? "all";
  if (filter === "active") query = query.eq("status", "active");
  if (filter === "draft") query = query.eq("status", "draft");
  if (filter === "archived") query = query.eq("status", "archived");

  const search = options?.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.ilike("name", `%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    mapSchemaError(error);
    throw new CampaignDataError("Failed to load campaigns", "LIST_FAILED");
  }

  return (data ?? []).map((row) => {
    const nested = row as typeof row & {
      lead_lists?: { name: string; leads?: { count: number }[] } | null;
      campaign_steps?: { count: number }[];
    };
    const lead_list_name = nested.lead_lists?.name ?? null;
    const lead_count = nested.lead_lists?.leads?.[0]?.count ?? 0;
    const step_count = nested.campaign_steps?.[0]?.count ?? 0;
    return {
      id: nested.id,
      workspace_id: nested.workspace_id,
      name: nested.name,
      description: nested.description,
      status: nested.status,
      lead_list_id: nested.lead_list_id,
      settings: (nested.settings ?? {}) as CampaignSettings,
      created_by: nested.created_by,
      created_at: nested.created_at,
      updated_at: nested.updated_at,
      lead_list_name,
      lead_count,
      step_count,
    };
  });
}

export async function getCampaignById(campaignId: string): Promise<CampaignWithSteps | null> {
  const { supabase, ctx } = await getScopedClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select(
      `
      id, workspace_id, name, description, status, lead_list_id, settings,
      created_by, created_at, updated_at,
      lead_lists ( name, leads ( count ) )
    `,
    )
    .eq("id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error) {
    mapSchemaError(error);
    throw new CampaignDataError("Failed to load campaign", "LOAD_FAILED");
  }
  if (!campaign) return null;

  const { data: steps, error: stepsError } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .order("step_order", { ascending: true });

  if (stepsError) {
    mapSchemaError(stepsError);
    throw new CampaignDataError("Failed to load campaign steps", "LOAD_FAILED");
  }

  const nested = campaign as typeof campaign & {
    lead_lists?: { name: string; leads?: { count: number }[] } | null;
  };

  return {
    id: nested.id,
    workspace_id: nested.workspace_id,
    name: nested.name,
    description: nested.description,
    status: nested.status,
    lead_list_id: nested.lead_list_id,
    settings: (nested.settings ?? {}) as CampaignSettings,
    created_by: nested.created_by,
    created_at: nested.created_at,
    updated_at: nested.updated_at,
    lead_list_name: nested.lead_lists?.name ?? null,
    lead_count: nested.lead_lists?.leads?.[0]?.count ?? 0,
    step_count: steps?.length ?? 0,
    steps: (steps ?? []) as CampaignStepRow[],
  };
}

async function assertLeadListInWorkspace(leadListId: string, workspaceId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("lead_lists")
    .select("id")
    .eq("id", leadListId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) throw new CampaignDataError("Lead list not found in this workspace", "VALIDATION");
}

export async function createCampaignDraft(input: {
  name: string;
  description?: string | null;
  lead_list_id?: string | null;
  settings?: CampaignSettings;
  steps: StepInput[];
}): Promise<CampaignWithSteps> {
  const { supabase, ctx } = await getScopedClient();
  const name = validateCampaignName(input.name);
  if (!name) throw new CampaignDataError("Invalid campaign name", "VALIDATION");

  const steps = validateStepsInput(input.steps);
  if (!steps) throw new CampaignDataError("Invalid sequence steps", "VALIDATION");

  if (input.lead_list_id) {
    await assertLeadListInWorkspace(input.lead_list_id, ctx.workspaceId, supabase);
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      workspace_id: ctx.workspaceId,
      name,
      description: input.description?.trim() || null,
      status: "draft",
      lead_list_id: input.lead_list_id ?? null,
      settings: input.settings ?? {},
      created_by: ctx.userId,
    })
    .select()
    .single();

  if (error) {
    mapSchemaError(error);
    throw new CampaignDataError("Failed to create campaign", "CREATE_FAILED");
  }

  const stepRows = steps.map((s) => ({
    campaign_id: campaign.id,
    workspace_id: ctx.workspaceId,
    step_order: s.step_order,
    step_type: s.step_type,
    configuration: sanitizeStepConfiguration(s.configuration),
  }));

  const { error: stepsError } = await supabase.from("campaign_steps").insert(stepRows);
  if (stepsError) {
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    mapSchemaError(stepsError);
    throw new CampaignDataError("Failed to save campaign steps", "CREATE_FAILED");
  }

  const full = await getCampaignById(campaign.id);
  if (!full) throw new CampaignDataError("Failed to load created campaign", "CREATE_FAILED");
  return full;
}

export async function updateCampaign(
  campaignId: string,
  input: {
    name?: string;
    description?: string | null;
    lead_list_id?: string | null;
    settings?: CampaignSettings;
    status?: string;
  },
): Promise<CampaignRow> {
  const { supabase, ctx } = await getScopedClient();

  const existing = await getCampaignById(campaignId);
  if (!existing) throw new CampaignDataError("Campaign not found", "NOT_FOUND");

  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = validateCampaignName(input.name);
    if (!name) throw new CampaignDataError("Invalid campaign name", "VALIDATION");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.settings !== undefined) patch.settings = input.settings;
  if (input.lead_list_id !== undefined) {
    if (input.lead_list_id) {
      await assertLeadListInWorkspace(input.lead_list_id, ctx.workspaceId, supabase);
    }
    patch.lead_list_id = input.lead_list_id;
  }
  if (input.status !== undefined) {
    const status = validateCampaignStatus(input.status);
    if (!status) throw new CampaignDataError("Invalid status", "VALIDATION");
    if (!canTransitionStatus(existing.status, status)) {
      throw new CampaignDataError("Status change not allowed", "VALIDATION");
    }
    patch.status = status;
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update(patch)
    .eq("id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();

  if (error || !data) throw new CampaignDataError("Failed to update campaign", "UPDATE_FAILED");
  return data as CampaignRow;
}

export async function replaceCampaignSteps(campaignId: string, steps: StepInput[]): Promise<void> {
  const { supabase, ctx } = await getScopedClient();
  const validated = validateStepsInput(steps);
  if (!validated) throw new CampaignDataError("Invalid sequence steps", "VALIDATION");

  const existing = await getCampaignById(campaignId);
  if (!existing) throw new CampaignDataError("Campaign not found", "NOT_FOUND");
  if (existing.status === "active") {
    throw new CampaignDataError("Pause the campaign before editing steps", "VALIDATION");
  }

  const { error: delError } = await supabase
    .from("campaign_steps")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId);

  if (delError) throw new CampaignDataError("Failed to update steps", "UPDATE_FAILED");

  const { error: insError } = await supabase.from("campaign_steps").insert(
    validated.map((s) => ({
      campaign_id: campaignId,
      workspace_id: ctx.workspaceId,
      step_order: s.step_order,
      step_type: s.step_type,
      configuration: sanitizeStepConfiguration(s.configuration),
    })),
  );

  if (insError) throw new CampaignDataError("Failed to save steps", "UPDATE_FAILED");
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const { supabase, ctx } = await getScopedClient();
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) throw new CampaignDataError("Failed to delete campaign", "DELETE_FAILED");
}
