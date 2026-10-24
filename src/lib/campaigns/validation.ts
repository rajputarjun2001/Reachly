import {
  CAMPAIGN_NAME_MAX,
  CONNECTION_NOTE_MAX,
  MAX_CAMPAIGN_STEPS,
  SUPPORTED_STEP_TYPES,
} from "./constants";
import type {
  CampaignStatus,
  CampaignStepConfiguration,
  CampaignStepRow,
  CampaignStepType,
} from "./types";

const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft",
  "active",
  "paused",
  "archived",
  "completed",
  "cancelled",
  "failed",
];
const CAMPAIGN_TERMINAL: CampaignStatus[] = ["completed", "cancelled", "failed", "archived"];

export function validateCampaignName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > CAMPAIGN_NAME_MAX) return null;
  return trimmed;
}

export function validateCampaignStatus(status: string): CampaignStatus | null {
  return CAMPAIGN_STATUSES.includes(status as CampaignStatus) ? (status as CampaignStatus) : null;
}

export function canTransitionStatus(from: CampaignStatus, to: CampaignStatus): boolean {
  if (from === to) return true;
  if (to === "archived") return true;
  if (CAMPAIGN_TERMINAL.includes(from)) return false;
  if (from === "draft") return to === "active";
  if (from === "active") return ["paused", "completed", "cancelled", "failed"].includes(to);
  if (from === "paused") return ["active", "cancelled", "failed"].includes(to);
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

/**
 * A sequence is one connection request (whose note may be empty) followed by up to
 * three follow-up messages, matching what the outreach engine can deliver.
 */
export function validateStepsInput(steps: StepInput[]): StepInput[] | null {
  if (steps.length === 0 || steps.length > MAX_CAMPAIGN_STEPS) return null;
  const orders = new Set<number>();
  const normalized: StepInput[] = [];
  for (const step of steps) {
    const step_type = validateStepType(step.step_type);
    if (!step_type || step.step_order < 1) return null;
    if (orders.has(step.step_order)) return null;
    orders.add(step.step_order);
    const configuration = sanitizeStepConfiguration(step.configuration ?? {});
    if (step_type === "message" && !configuration.body_template) return null;
    if (step_type === "connection_request" && (configuration.body_template?.length ?? 0) > CONNECTION_NOTE_MAX) {
      return null;
    }
    if ((configuration.delay_days ?? 0) > 60) return null;
    normalized.push({ ...step, step_type, configuration });
  }
  normalized.sort((a, b) => a.step_order - b.step_order);
  const [first, ...rest] = normalized;
  if (first.step_type !== "connection_request") return null;
  if (rest.some((s) => s.step_type !== "message")) return null;
  return normalized;
}

export type SequenceFields = {
  connectionNote: string;
  connectionLabel: string | null;
  messages: { step: number; delayDays: number; body: string; label: string | null }[];
};

/** Converts validated UI steps into the campaign document's sequence fields. */
export function stepsToSequence(steps: StepInput[]): SequenceFields {
  const [connection, ...messages] = steps;
  return {
    connectionNote: connection.configuration.body_template ?? "",
    connectionLabel: connection.configuration.label ?? null,
    messages: messages.map((m, i) => ({
      step: i + 1,
      delayDays: m.configuration.delay_days ?? 0,
      body: m.configuration.body_template ?? "",
      label: m.configuration.label ?? null,
    })),
  };
}

/** Rebuilds UI steps from a campaign document's sequence fields. */
export function sequenceToSteps(
  campaign: { id: string; workspace_id: string; created_at: string; updated_at: string },
  sequence: SequenceFields,
): CampaignStepRow[] {
  const base = {
    campaign_id: campaign.id,
    workspace_id: campaign.workspace_id,
    created_at: campaign.created_at,
    updated_at: campaign.updated_at,
  };
  const connection: CampaignStepRow = {
    ...base,
    id: `${campaign.id}-step-1`,
    step_order: 1,
    step_type: "connection_request",
    configuration: {
      label: sequence.connectionLabel ?? "Connection Request",
      body_template: sequence.connectionNote,
      delay_days: 0,
    },
  };
  const messages = [...sequence.messages]
    .sort((a, b) => a.step - b.step)
    .map<CampaignStepRow>((m) => ({
      ...base,
      id: `${campaign.id}-step-${m.step + 1}`,
      step_order: m.step + 1,
      step_type: "message",
      configuration: {
        label: m.label ?? `Follow-up ${m.step}`,
        body_template: m.body,
        delay_days: m.delayDays,
      },
    }));
  return [connection, ...messages];
}
