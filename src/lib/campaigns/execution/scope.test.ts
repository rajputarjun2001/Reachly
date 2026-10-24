import { describe, expect, it } from "vitest";
import { assertMatchingWorkspace, canBindJobToEnrollment } from "./scope";

describe("execution workspace scope", () => {
  it("rejects cross-workspace references", () => {
    expect(() =>
      assertMatchingWorkspace("ws-a", [
        { label: "campaign", workspaceId: "ws-a" },
        { label: "lead", workspaceId: "ws-b" },
      ]),
    ).toThrow(/lead workspace mismatch/);
  });

  it("validates job/enrollment binding", () => {
    expect(
      canBindJobToEnrollment(
        { workspace_id: "w1", campaign_id: "c1", enrollment_id: "e1" },
        { workspace_id: "w1", campaign_id: "c1", id: "e1" },
      ),
    ).toBe(true);
    expect(
      canBindJobToEnrollment(
        { workspace_id: "w1", campaign_id: "c1", enrollment_id: "e1" },
        { workspace_id: "w2", campaign_id: "c1", id: "e1" },
      ),
    ).toBe(false);
  });
});
