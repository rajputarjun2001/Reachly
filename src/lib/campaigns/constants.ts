import type { CampaignStepType } from "./types";

export const CAMPAIGN_NAME_MAX = 120;
export const CAMPAIGNS_PAGE_SIZE = 50;
export const MAX_CAMPAIGN_STEPS = 10;

export const SUPPORTED_STEP_TYPES: CampaignStepType[] = ["connection_request", "message"];

export const DEFAULT_CAMPAIGN_STEPS = [
  {
    step_type: "connection_request" as const,
    step_order: 1,
    configuration: {
      label: "Connection Request (Day 0)",
      body_template:
        "Hi {{first_name}}, I noticed your work and would love to connect.",
      delay_days: 0,
    },
  },
  {
    step_type: "message" as const,
    step_order: 2,
    configuration: {
      label: "Follow-up Message (Day 3 after accept)",
      body_template: "Thanks for connecting, {{first_name}}! I'd love to learn more about your work.",
      delay_days: 3,
    },
  },
  {
    step_type: "message" as const,
    step_order: 3,
    configuration: {
      label: "Value Message (Day 7)",
      body_template: "Sharing a quick note — happy to connect if this is relevant to you.",
      delay_days: 7,
    },
  },
];
