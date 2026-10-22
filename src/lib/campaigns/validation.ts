import { CAMPAIGN_NAME_MAX, SUPPORTED_STEP_TYPES } from "./constants";
import type {
  CampaignStatus,
  CampaignStepConfiguration,
  CampaignStepType,
} from "./types";

const VALID_STATUSES: CampaignStatus[] = ["draft", "active", "paused", "archived"];

export function validateCampaignName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > CAMPAIGN_NAME_MAX) return null;
  return trimmed;
}

export function validateCampaignStatus(status: string): CampaignStatus | null {
  return VALID_STATUSES.includes(status as CampaignStatus) ? (status as CampaignStatus) : null;
}

export function canTransitionStatus(from: CampaignStatus, to: CampaignStatus): boolean {
  if (from === to) return true;
  if (to === "archived") return true;
  if (from === "archived") return false;
  if (from === "draft" && (to === "active" || to === "paused")) return true;
  if (from === "active" && to === "paused") return true;
  if (from === "paused" && to === "active") return true;
  return false;
}

export function validateStepType(type: string): CampaignStepType | null {
  return SUPPORTED_STEP_TYPES.includes(type as CampaignStepType)
    ? (type as CampaignStepType)
    : null;
}

export function sanitizeStepConfiguration(
  config: CampaignStepConfiguration,
): CampaignStepConfiguration {
  return {
    label: config.label?.trim() || undefined,
    body_template: config.body_template?.trim() || "",
    delay_days:
      typeof config.delay_days === "number" && config.delay_days >= 0
        ? Math.floor(config.delay_days)
        : 0,
  };
}

export type StepInput = {
  step_order: number;
  step_type: string;
  configuration: CampaignStepConfiguration;
};

export function validateStepsInput(steps: StepInput[]): StepInput[] | null {
  if (steps.length === 0) return null;
  const orders = new Set<number>();
  const normalized: StepInput[] = [];
  for (const step of steps) {
    const step_type = validateStepType(step.step_type);
    if (!step_type || step.step_order < 1) return null;
    if (orders.has(step.step_order)) return null;
    orders.add(step.step_order);
    const configuration = sanitizeStepConfiguration(step.configuration);
    if (!configuration.body_template) return null;
    normalized.push({ ...step, step_type, configuration });
  }
  return normalized.sort((a, b) => a.step_order - b.step_order);
}
