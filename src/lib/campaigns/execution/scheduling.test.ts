import { describe, expect, it } from "vitest";
import {
  buildJobIdempotencyKey,
  computeNextRetryAt,
  computeStepScheduledAt,
  isJobDue,
  validateStepDelayDays,
} from "./scheduling";

describe("execution scheduling", () => {
  it("validates step delays in UTC", () => {
    expect(validateStepDelayDays(0)).toBe(0);
    expect(validateStepDelayDays(3)).toBe(3);
    expect(validateStepDelayDays(-1)).toBeNull();
    expect(validateStepDelayDays(400)).toBeNull();
    expect(validateStepDelayDays("x")).toBeNull();
  });

  it("computes scheduled timestamps from delay days", () => {
    const base = new Date("2026-01-01T12:00:00.000Z");
    const scheduled = computeStepScheduledAt(2, base);
    expect(scheduled.toISOString()).toBe("2026-01-03T12:00:00.000Z");
  });

  it("builds stable idempotency keys", () => {
    const key = buildJobIdempotencyKey("enr-1", "step-1");
    expect(key).toBe("enr-1:step-1");
    expect(buildJobIdempotencyKey("enr-1", "step-1")).toBe(key);
  });

  it("applies retry backoff", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const next = computeNextRetryAt(1, from);
    expect(next.getTime() - from.getTime()).toBe(60_000);
  });

  it("evaluates due jobs with retry window", () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    expect(isJobDue("2026-01-01T00:00:00.000Z", null, now)).toBe(true);
    expect(isJobDue("2026-01-03T00:00:00.000Z", null, now)).toBe(false);
    expect(isJobDue("2026-01-01T00:00:00.000Z", "2026-01-03T00:00:00.000Z", now)).toBe(false);
  });
});
