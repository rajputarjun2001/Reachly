import { describe, expect, it } from "vitest";
import {
  createMockCampaignExecutor,
  disabledCampaignExecutor,
  EXECUTOR_DISABLED_CODE,
  isProductionExecutorEnabled,
  resolveCampaignExecutor,
} from "./executor";
import type { ExecutionRequest } from "./types";

const sampleRequest: ExecutionRequest = {
  jobId: "job-1",
  idempotencyKey: "enr:step",
  campaignId: "camp-1",
  enrollmentId: "enr-1",
  leadId: "lead-1",
  stepId: "step-1",
  stepOrder: 1,
  stepType: "message",
  attemptNumber: 1,
};

describe("campaign executor", () => {
  it("disables production executor by default", () => {
    expect(isProductionExecutorEnabled()).toBe(false);
    expect(resolveCampaignExecutor().type).toBe("disabled");
  });

  it("never reports success when disabled", async () => {
    const result = await disabledCampaignExecutor.execute(sampleRequest);
    expect(result.kind).toBe("unsupported");
    if (result.kind === "unsupported") {
      expect(result.code).toBe(EXECUTOR_DISABLED_CODE);
    }
  });

  it("supports mock executor for tests only", async () => {
    const mock = createMockCampaignExecutor(() => ({
      kind: "retryable_failure",
      code: "TEMP",
      message: "retry",
    }));
    const result = await mock.execute(sampleRequest);
    expect(result.kind).toBe("retryable_failure");
  });

  it("does not enable mock without env flag", () => {
    const mock = createMockCampaignExecutor();
    expect(resolveCampaignExecutor({ allowMock: false, mock }).type).toBe("disabled");
  });
});
