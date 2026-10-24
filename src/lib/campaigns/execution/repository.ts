import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listLeadsForList } from "@/lib/leads/repository";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { getCampaignById } from "../repository";
import type { CampaignStepRow, CampaignWithSteps } from "../types";
import { DEFAULT_JOB_MAX_ATTEMPTS, WORKER_ID_MAX_LENGTH } from "./constants";
import {
  disabledCampaignExecutor,
  isProductionExecutorEnabled,
  resolveCampaignExecutor,
  type CampaignExecutor,
} from "./executor";
import {
  canScheduleJobsForCampaign,
  canTransitionCampaignStatus,
  campaignMayComplete,
  isJobTerminal,
} from "./lifecycle";
import {
  buildJobIdempotencyKey,
  computeNextRetryAt,
  computeStepScheduledAt,
  validateStepDelayDays,
} from "./scheduling";
import type {
  CampaignExecutionJobRow,
  CampaignExecutionStats,
  ExecutionRequest,
} from "./types";

export class CampaignExecutionError extends Error {
  constructor(
    message: string,
    public code: string = "EXECUTION_ERROR",
  ) {
    super(message);
  }
}

async function getScopedClient() {
  const ctx = await requireWorkspaceContext();
  const supabase = await createClient();
  return { supabase, ctx };
}

function mapExecutionSchemaError(error: { code?: string; message?: string }) {
  const hint = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    hint.includes("campaign_enrollments") ||
    hint.includes("campaign_execution") ||
    hint.includes("schema cache")
  ) {
    throw new CampaignExecutionError(
      "Campaign execution tables are missing. Apply the latest Supabase migrations.",
      "SCHEMA_MISSING",
    );
  }
  if (error.code === "23505" && hint.includes("campaign_enrollments_active_lead")) {
    throw new CampaignExecutionError("Lead is already enrolled in this campaign.", "DUPLICATE_ENROLLMENT");
  }
  if (error.code === "23505") {
    throw new CampaignExecutionError("Duplicate execution job.", "DUPLICATE_JOB");
  }
}

async function assertLeadInCampaignList(
  leadId: string,
  leadListId: string,
  workspaceId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .eq("lead_list_id", leadListId)
    .maybeSingle();
  if (!data) throw new CampaignExecutionError("Lead does not belong to campaign list", "VALIDATION");
}

export async function getCampaignExecutionStats(campaignId: string): Promise<CampaignExecutionStats> {
  const { supabase, ctx } = await getScopedClient();

  const { data: enrollments, error: enrError } = await supabase
    .from("campaign_enrollments")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId);

  if (enrError) {
    mapExecutionSchemaError(enrError);
    throw new CampaignExecutionError("Failed to load enrollments", "LOAD_FAILED");
  }

  const { data: jobs, error: jobError } = await supabase
    .from("campaign_execution_jobs")
    .select("status")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId);

  if (jobError) {
    mapExecutionSchemaError(jobError);
    throw new CampaignExecutionError("Failed to load jobs", "LOAD_FAILED");
  }

  const e = enrollments ?? [];
  const j = jobs ?? [];

  return {
    enrolled: e.length,
    active_enrollments: e.filter((x) => x.status === "active").length,
    completed_enrollments: e.filter((x) => x.status === "completed").length,
    failed_enrollments: e.filter((x) => x.status === "failed").length,
    pending_jobs: j.filter((x) => x.status === "pending").length,
    running_jobs: j.filter((x) => x.status === "claimed" || x.status === "running").length,
    blocked_jobs: j.filter((x) => x.status === "blocked").length,
    completed_jobs: j.filter((x) => x.status === "completed").length,
    failed_jobs: j.filter((x) => x.status === "failed").length,
  };
}

async function scheduleJobForStep(
  campaign: CampaignWithSteps,
  enrollmentId: string,
  step: CampaignStepRow,
  baseTime: Date,
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
) {
  const delay = validateStepDelayDays(step.configuration.delay_days);
  if (delay === null) throw new CampaignExecutionError("Invalid step delay", "VALIDATION");

  const scheduledAt = computeStepScheduledAt(delay, baseTime).toISOString();
  const idempotencyKey = buildJobIdempotencyKey(enrollmentId, step.id);

  const { error } = await supabase.from("campaign_execution_jobs").insert({
    workspace_id: workspaceId,
    enrollment_id: enrollmentId,
    campaign_id: campaign.id,
    campaign_step_id: step.id,
    status: "pending",
    scheduled_at: scheduledAt,
    max_attempts: DEFAULT_JOB_MAX_ATTEMPTS,
    idempotency_key: idempotencyKey,
  });

  if (error) {
    if (error.code === "23505") return;
    mapExecutionSchemaError(error);
    throw new CampaignExecutionError("Failed to schedule job", "CREATE_FAILED");
  }

  await supabase
    .from("campaign_enrollments")
    .update({
      current_step_id: step.id,
      current_step_order: step.step_order,
      next_run_at: scheduledAt,
    })
    .eq("id", enrollmentId)
    .eq("workspace_id", workspaceId);
}

export async function startCampaignExecution(campaignId: string): Promise<{ enrolled: number; jobsCreated: number }> {
  const { supabase, ctx } = await getScopedClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new CampaignExecutionError("Campaign not found", "NOT_FOUND");

  if (!canTransitionCampaignStatus(campaign.status, "active")) {
    throw new CampaignExecutionError("Campaign cannot be started from its current status", "VALIDATION");
  }
  if (!campaign.lead_list_id) {
    throw new CampaignExecutionError("Attach a lead list before starting", "VALIDATION");
  }
  if (campaign.steps.length === 0) {
    throw new CampaignExecutionError("Add at least one sequence step", "VALIDATION");
  }

  const firstStep = campaign.steps[0];
  const now = new Date();

  if (campaign.status === "draft") {
    const { error: statusError } = await supabase
      .from("campaigns")
      .update({ status: "active" })
      .eq("id", campaignId)
      .eq("workspace_id", ctx.workspaceId);
    if (statusError) throw new CampaignExecutionError("Failed to activate campaign", "UPDATE_FAILED");
  }

  let enrolled = 0;
  let jobsCreated = 0;
  let page = 1;
  const pageSize = 100;

  while (true) {
    const batch = await listLeadsForList(campaign.lead_list_id, { page, pageSize });
    if (batch.leads.length === 0) break;

    for (const lead of batch.leads) {
      await assertLeadInCampaignList(lead.id, campaign.lead_list_id!, ctx.workspaceId, supabase);

      const { data: enrollment, error: enrError } = await supabase
        .from("campaign_enrollments")
        .insert({
          workspace_id: ctx.workspaceId,
          campaign_id: campaignId,
          lead_id: lead.id,
          status: "active",
          current_step_id: firstStep.id,
          current_step_order: firstStep.step_order,
        })
        .select("id")
        .maybeSingle();

      if (enrError) {
        if (enrError.code === "23505") continue;
        mapExecutionSchemaError(enrError);
        throw new CampaignExecutionError("Failed to enroll lead", "CREATE_FAILED");
      }
      if (!enrollment) continue;

      enrolled += 1;
      try {
        await scheduleJobForStep(campaign, enrollment.id, firstStep, now, supabase, ctx.workspaceId);
        jobsCreated += 1;
      } catch (err) {
        if (err instanceof CampaignExecutionError && err.code === "DUPLICATE_JOB") continue;
        throw err;
      }
    }

    if (batch.leads.length < pageSize) break;
    page += 1;
  }

  return { enrolled, jobsCreated };
}

export async function pauseCampaignExecution(campaignId: string): Promise<void> {
  const { supabase, ctx } = await getScopedClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new CampaignExecutionError("Campaign not found", "NOT_FOUND");
  if (!canTransitionCampaignStatus(campaign.status, "paused")) {
    throw new CampaignExecutionError("Cannot pause from current status", "VALIDATION");
  }

  await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaignId).eq("workspace_id", ctx.workspaceId);

  await supabase
    .from("campaign_enrollments")
    .update({ status: "paused" })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .in("status", ["active"]);

  await supabase
    .from("campaign_execution_jobs")
    .update({ status: "skipped", last_error_code: "CAMPAIGN_PAUSED", last_error_message: "Campaign paused" })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .in("status", ["pending", "claimed"]);
}

export async function resumeCampaignExecution(campaignId: string): Promise<void> {
  const { supabase, ctx } = await getScopedClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new CampaignExecutionError("Campaign not found", "NOT_FOUND");
  if (!canTransitionCampaignStatus(campaign.status, "active")) {
    throw new CampaignExecutionError("Cannot resume from current status", "VALIDATION");
  }

  await supabase.from("campaigns").update({ status: "active" }).eq("id", campaignId).eq("workspace_id", ctx.workspaceId);

  const { data: pausedEnrollments } = await supabase
    .from("campaign_enrollments")
    .select("id, current_step_id")
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "paused");

  for (const enr of pausedEnrollments ?? []) {
    await supabase
      .from("campaign_enrollments")
      .update({ status: "active" })
      .eq("id", enr.id)
      .eq("workspace_id", ctx.workspaceId);

    if (!enr.current_step_id) continue;

    const { data: existingJob } = await supabase
      .from("campaign_execution_jobs")
      .select("id, status")
      .eq("enrollment_id", enr.id)
      .eq("campaign_step_id", enr.current_step_id)
      .maybeSingle();

    if (existingJob && existingJob.status === "skipped") {
      await supabase
        .from("campaign_execution_jobs")
        .update({
          status: "pending",
          scheduled_at: new Date().toISOString(),
          last_error_code: null,
          last_error_message: null,
        })
        .eq("id", existingJob.id);
    }
  }
}

export async function cancelCampaignExecution(campaignId: string): Promise<void> {
  const { supabase, ctx } = await getScopedClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign) throw new CampaignExecutionError("Campaign not found", "NOT_FOUND");
  if (!canTransitionCampaignStatus(campaign.status, "cancelled")) {
    throw new CampaignExecutionError("Cannot cancel from current status", "VALIDATION");
  }

  await supabase.from("campaigns").update({ status: "cancelled" }).eq("id", campaignId).eq("workspace_id", ctx.workspaceId);

  await supabase
    .from("campaign_enrollments")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .in("status", ["active", "paused"]);

  await supabase
    .from("campaign_execution_jobs")
    .update({
      status: "cancelled",
      last_error_code: "CAMPAIGN_CANCELLED",
      last_error_message: "Campaign cancelled",
    })
    .eq("campaign_id", campaignId)
    .eq("workspace_id", ctx.workspaceId)
    .in("status", ["pending", "claimed", "running"]);
}

export async function claimDueCampaignJobs(
  workerId: string,
  limit = 10,
): Promise<CampaignExecutionJobRow[]> {
  const { supabase } = await getScopedClient();
  const trimmed = workerId.trim();
  if (!trimmed || trimmed.length > WORKER_ID_MAX_LENGTH) {
    throw new CampaignExecutionError("Invalid worker id", "VALIDATION");
  }

  const { data, error } = await supabase.rpc("claim_due_campaign_jobs", {
    p_worker_id: trimmed,
    p_limit: limit,
  });

  if (error) {
    mapExecutionSchemaError(error);
    throw new CampaignExecutionError("Failed to claim jobs", "CLAIM_FAILED");
  }

  return (data ?? []) as CampaignExecutionJobRow[];
}

async function loadJobContext(job: CampaignExecutionJobRow) {
  const { supabase, ctx } = await getScopedClient();

  const campaign = await getCampaignById(job.campaign_id);
  if (!campaign || !canScheduleJobsForCampaign(campaign.status)) {
    throw new CampaignExecutionError("Campaign is not runnable", "NOT_RUNNABLE");
  }

  const step = campaign.steps.find((s) => s.id === job.campaign_step_id);
  if (!step) throw new CampaignExecutionError("Step not found", "NOT_FOUND");

  const { data: enrollment } = await supabase
    .from("campaign_enrollments")
    .select("*")
    .eq("id", job.enrollment_id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!enrollment || enrollment.status !== "active") {
    throw new CampaignExecutionError("Enrollment is not active", "NOT_RUNNABLE");
  }

  return { campaign, step, enrollment, ctx, supabase };
}

export async function executeCampaignJob(
  jobId: string,
  executor: CampaignExecutor = disabledCampaignExecutor,
): Promise<void> {
  const { supabase, ctx } = await getScopedClient();

  const { data: job, error } = await supabase
    .from("campaign_execution_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error || !job) throw new CampaignExecutionError("Job not found", "NOT_FOUND");

  const row = job as CampaignExecutionJobRow;
  if (isJobTerminal(row.status)) return;

  await supabase
    .from("campaign_execution_jobs")
    .update({ status: "running" })
    .eq("id", jobId)
    .eq("workspace_id", ctx.workspaceId);

  const { campaign, step, enrollment } = await loadJobContext(row);
  const attemptNumber = row.attempt_count + 1;
  const startedAt = new Date().toISOString();

  const request: ExecutionRequest = {
    jobId: row.id,
    idempotencyKey: row.idempotency_key,
    campaignId: row.campaign_id,
    enrollmentId: row.enrollment_id,
    leadId: enrollment.lead_id,
    stepId: step.id,
    stepOrder: step.step_order,
    stepType: step.step_type,
    attemptNumber,
  };

  const result = await executor.execute(request);
  const finishedAt = new Date().toISOString();

  await supabase.from("campaign_execution_attempts").insert({
    workspace_id: ctx.workspaceId,
    job_id: row.id,
    attempt_number: attemptNumber,
    started_at: startedAt,
    finished_at: finishedAt,
    outcome:
      result.kind === "success"
        ? "success"
        : result.kind === "retryable_failure"
          ? "retryable_failure"
          : result.kind === "permanent_failure"
            ? "permanent_failure"
            : "unsupported",
    error_code: result.kind === "success" ? null : result.code,
    error_message: result.kind === "success" ? null : result.message,
    executor_type: executor.type,
  });

  if (result.kind === "success") {
    await supabase
      .from("campaign_execution_jobs")
      .update({
        status: "completed",
        attempt_count: attemptNumber,
        last_error_code: null,
        last_error_message: null,
      })
      .eq("id", jobId);

    await advanceEnrollmentAfterStep(campaign, enrollment.id, step.step_order);
    await tryFinalizeCampaign(campaign.id);
    return;
  }

  if (result.kind === "unsupported") {
    await supabase
      .from("campaign_execution_jobs")
      .update({
        status: "blocked",
        attempt_count: attemptNumber,
        last_error_code: result.code,
        last_error_message: result.message,
      })
      .eq("id", jobId);
    return;
  }

  const isRetryable = result.kind === "retryable_failure";
  const exhausted = attemptNumber >= row.max_attempts;

  if (isRetryable && !exhausted) {
    const nextRetry = computeNextRetryAt(attemptNumber).toISOString();
    await supabase
      .from("campaign_execution_jobs")
      .update({
        status: "pending",
        attempt_count: attemptNumber,
        next_retry_at: nextRetry,
        last_error_code: result.code,
        last_error_message: result.message,
        claimed_at: null,
        claimed_by: null,
      })
      .eq("id", jobId);
    return;
  }

  await supabase
    .from("campaign_execution_jobs")
    .update({
      status: "failed",
      attempt_count: attemptNumber,
      last_error_code: result.code,
      last_error_message: result.message,
    })
    .eq("id", jobId);

  await supabase
    .from("campaign_enrollments")
    .update({
      status: "failed",
      last_error_code: result.code,
      last_error_message: result.message,
    })
    .eq("id", enrollment.id)
    .eq("workspace_id", ctx.workspaceId);

  await tryFinalizeCampaign(campaign.id);
}

async function advanceEnrollmentAfterStep(
  campaign: CampaignWithSteps,
  enrollmentId: string,
  completedStepOrder: number,
) {
  const { supabase, ctx } = await getScopedClient();
  const nextStep = campaign.steps.find((s) => s.step_order > completedStepOrder);
  if (!nextStep) {
    await supabase
      .from("campaign_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        next_run_at: null,
      })
      .eq("id", enrollmentId)
      .eq("workspace_id", ctx.workspaceId);
    return;
  }

  await scheduleJobForStep(campaign, enrollmentId, nextStep, new Date(), supabase, ctx.workspaceId);
}

export async function tryFinalizeCampaign(campaignId: string): Promise<void> {
  const { supabase, ctx } = await getScopedClient();
  const campaign = await getCampaignById(campaignId);
  if (!campaign || campaign.status !== "active") return;

  const stats = await getCampaignExecutionStats(campaignId);
  const openJobs = stats.pending_jobs + stats.running_jobs;
  if (!campaignMayComplete(openJobs)) return;

  const openEnrollments = stats.active_enrollments;
  if (openEnrollments > 0) return;

  if (stats.failed_enrollments > 0 && stats.completed_enrollments === 0) {
    await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaignId).eq("workspace_id", ctx.workspaceId);
    return;
  }

  await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaignId).eq("workspace_id", ctx.workspaceId);
}

export async function processDueCampaignJobs(options?: {
  workerId?: string;
  limit?: number;
  executor?: CampaignExecutor;
}): Promise<{ claimed: number; processed: number }> {
  const workerId = options?.workerId ?? `worker-${ctxSafeUserSuffix()}`;
  const executor = resolveCampaignExecutor({
    allowMock: process.env.CAMPAIGN_EXECUTOR_MOCK === "true",
    mock: options?.executor,
  });

  if (!isProductionExecutorEnabled() && executor.type === "disabled") {
    // Still process to record blocked/unsupported outcomes for due jobs
  }

  const claimed = await claimDueCampaignJobs(workerId, options?.limit ?? 10);
  let processed = 0;
  for (const job of claimed) {
    await executeCampaignJob(job.id, executor);
    processed += 1;
  }
  return { claimed: claimed.length, processed };
}

function ctxSafeUserSuffix(): string {
  return `${Date.now()}`;
}

