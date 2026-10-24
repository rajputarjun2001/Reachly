import type { CampaignStepType } from "../types";

export type EnrollmentStatus = "active" | "paused" | "completed" | "cancelled" | "failed";

export type JobStatus =
  | "pending"
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "blocked";

export type AttemptOutcome =
  | "success"
  | "retryable_failure"
  | "permanent_failure"
  | "unsupported";

export type ExecutorType = "disabled" | "mock" | "linkedin";

export type CampaignEnrollmentRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  lead_id: string;
  status: EnrollmentStatus;
  current_step_id: string | null;
  current_step_order: number | null;
  next_run_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignExecutionJobRow = {
  id: string;
  workspace_id: string;
  enrollment_id: string;
  campaign_id: string;
  campaign_step_id: string;
  status: JobStatus;
  scheduled_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  idempotency_key: string;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignExecutionAttemptRow = {
  id: string;
  workspace_id: string;
  job_id: string;
  attempt_number: number;
  started_at: string;
  finished_at: string | null;
  outcome: AttemptOutcome;
  error_code: string | null;
  error_message: string | null;
  executor_type: ExecutorType;
  created_at: string;
};

export type ExecutionRequest = {
  jobId: string;
  idempotencyKey: string;
  campaignId: string;
  enrollmentId: string;
  leadId: string;
  stepId: string;
  stepOrder: number;
  stepType: CampaignStepType;
  attemptNumber: number;
};

export type ExecutionResult =
  | { kind: "success"; externalRef?: string }
  | { kind: "retryable_failure"; code: string; message: string }
  | { kind: "permanent_failure"; code: string; message: string }
  | { kind: "unsupported"; code: string; message: string };

export type CampaignExecutionStats = {
  enrolled: number;
  active_enrollments: number;
  completed_enrollments: number;
  failed_enrollments: number;
  pending_jobs: number;
  running_jobs: number;
  blocked_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
};
