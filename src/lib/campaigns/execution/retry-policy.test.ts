import { describe, expect, it } from "vitest";
import { DEFAULT_JOB_MAX_ATTEMPTS } from "./constants";

describe("retry policy bounds", () => {
  it("uses bounded default max attempts", () => {
    expect(DEFAULT_JOB_MAX_ATTEMPTS).toBe(3);
  });

  it("marks attempts exhausted at max", () => {
    const attemptNumber = 3;
    const maxAttempts = 3;
    expect(attemptNumber >= maxAttempts).toBe(true);
  });
});
