import { describe, expect, it } from "vitest";
import {
  canScheduleJobsForCampaign,
  canTransitionCampaignStatus,
  canTransitionEnrollment,
  campaignMayComplete,
  isJobTerminal,
} from "./lifecycle";

describe("campaign execution lifecycle", () => {
  it("allows expected campaign transitions", () => {
    expect(canTransitionCampaignStatus("draft", "active")).toBe(true);
    expect(canTransitionCampaignStatus("active", "paused")).toBe(true);
    expect(canTransitionCampaignStatus("paused", "active")).toBe(true);
    expect(canTransitionCampaignStatus("active", "completed")).toBe(true);
    expect(canTransitionCampaignStatus("active", "cancelled")).toBe(true);
    expect(canTransitionCampaignStatus("completed", "active")).toBe(false);
    expect(canTransitionCampaignStatus("archived", "active")).toBe(false);
  });

  it("gates scheduling on active campaigns only", () => {
    expect(canScheduleJobsForCampaign("active")).toBe(true);
    expect(canScheduleJobsForCampaign("paused")).toBe(false);
    expect(canScheduleJobsForCampaign("draft")).toBe(false);
  });

  it("tracks enrollment transitions", () => {
    expect(canTransitionEnrollment("active", "paused")).toBe(true);
    expect(canTransitionEnrollment("active", "completed")).toBe(true);
    expect(canTransitionEnrollment("completed", "active")).toBe(false);
  });

  it("prevents campaign completion while jobs are open", () => {
    expect(campaignMayComplete(0)).toBe(true);
    expect(campaignMayComplete(1)).toBe(false);
  });

  it("identifies terminal job statuses", () => {
    expect(isJobTerminal("completed")).toBe(true);
    expect(isJobTerminal("blocked")).toBe(true);
    expect(isJobTerminal("pending")).toBe(false);
  });
});
