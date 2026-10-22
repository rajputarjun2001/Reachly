import { describe, expect, it } from "vitest";
import {
  canTransitionStatus,
  validateCampaignName,
  validateStepsInput,
} from "./validation";

describe("campaign validation", () => {
  it("validates names", () => {
    expect(validateCampaignName("  Q4 Outreach  ")).toBe("Q4 Outreach");
    expect(validateCampaignName("")).toBeNull();
  });

  it("allows defined status transitions", () => {
    expect(canTransitionStatus("draft", "active")).toBe(true);
    expect(canTransitionStatus("active", "paused")).toBe(true);
    expect(canTransitionStatus("paused", "active")).toBe(true);
    expect(canTransitionStatus("archived", "active")).toBe(false);
  });

  it("validates steps", () => {
    const steps = validateStepsInput([
      {
        step_order: 1,
        step_type: "connection_request",
        configuration: { body_template: "Hello", delay_days: 0 },
      },
    ]);
    expect(steps).toHaveLength(1);
    expect(validateStepsInput([{ step_order: 1, step_type: "invalid", configuration: { body_template: "x" } }])).toBeNull();
  });
});
