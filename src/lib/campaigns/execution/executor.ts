import type { ExecutionRequest, ExecutionResult, ExecutorType } from "./types";

export type CampaignExecutor = {
  type: ExecutorType;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
};

export const EXECUTOR_DISABLED_CODE = "EXECUTOR_DISABLED";
export const EXECUTOR_UNSUPPORTED_CODE = "LINKEDIN_NOT_CONFIGURED";

/** Production default — never reports success for outreach actions. */
export const disabledCampaignExecutor: CampaignExecutor = {
  type: "disabled",
  async execute(): Promise<ExecutionResult> {
    return {
      kind: "unsupported",
      code: EXECUTOR_DISABLED_CODE,
      message: "Live LinkedIn execution is not configured for this environment.",
    };
  },
};

export function createMockCampaignExecutor(
  handler?: (request: ExecutionRequest) => ExecutionResult | Promise<ExecutionResult>,
): CampaignExecutor {
  return {
    type: "mock",
    async execute(request) {
      if (handler) return handler(request);
      return {
        kind: "unsupported",
        code: EXECUTOR_UNSUPPORTED_CODE,
        message: "Mock executor default: external action not performed.",
      };
    },
  };
}

export function resolveCampaignExecutor(options?: {
  allowMock?: boolean;
  mock?: CampaignExecutor;
}): CampaignExecutor {
  if (options?.allowMock && options.mock) return options.mock;
  return disabledCampaignExecutor;
}

export function isProductionExecutorEnabled(): boolean {
  return process.env.CAMPAIGN_EXECUTOR_ENABLED === "true";
}
