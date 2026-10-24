import type { CampaignStatus } from "../types";
import type { EnrollmentStatus, JobStatus } from "./types";

const CAMPAIGN_TERMINAL: CampaignStatus[] = ["completed", "cancelled", "failed", "archived"];

const VALID_CAMPAIGN: CampaignStatus[] = [
  "draft",
  "active",
  "paused",
  "archived",
  "completed",
  "cancelled",
  "failed",
];

export function validateExtendedCampaignStatus(status: string): CampaignStatus | null {
  return VALID_CAMPAIGN.includes(status as CampaignStatus) ? (status as CampaignStatus) : null;
}

export function canTransitionCampaignStatus(from: CampaignStatus, to: CampaignStatus): boolean {
  if (from === to) return true;
  if (to === "archived") return true;
  if (CAMPAIGN_TERMINAL.includes(from)) return false;
  if (from === "draft" && (to === "active" || to === "paused" || to === "cancelled")) return true;
  if (from === "active" && (to === "paused" || to === "completed" || to === "cancelled" || to === "failed")) {
    return true;
  }
  if (from === "paused" && (to === "active" || to === "cancelled" || to === "failed")) return true;
  return false;
}

export function canScheduleJobsForCampaign(status: CampaignStatus): boolean {
  return status === "active";
}

export function canTransitionEnrollment(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  if (from === to) return true;
  if (from === "completed" || from === "cancelled" || from === "failed") return false;
  if (from === "active" && (to === "paused" || to === "completed" || to === "cancelled" || to === "failed")) {
    return true;
  }
  if (from === "paused" && (to === "active" || to === "cancelled" || to === "failed" || to === "completed")) {
    return true;
  }
  return false;
}

export function isJobTerminal(status: JobStatus): boolean {
  return ["completed", "failed", "cancelled", "skipped", "blocked"].includes(status);
}

export function isJobRunnable(status: JobStatus): boolean {
  return status === "pending" || status === "claimed" || status === "running";
}

export function campaignMayComplete(pendingOrRunningJobs: number): boolean {
  return pendingOrRunningJobs === 0;
}
