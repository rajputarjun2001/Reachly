import { describe, expect, it } from "vitest";
import { formatSkipReason } from "./skip-reason";

describe("formatSkipReason", () => {
  it("maps known automation codes to readable text", () => {
    expect(formatSkipReason("connect_unavailable")).toMatch(/Connect button/i);
    expect(formatSkipReason("send_failed:SESSION_EXPIRED")).toMatch(/session expired/i);
    expect(formatSkipReason("send_failed:LOGIN_FORM_NOT_FOUND")).toMatch(/session cookies/i);
  });

  it("returns null for empty values", () => {
    expect(formatSkipReason(null)).toBeNull();
    expect(formatSkipReason("  ")).toBeNull();
  });
});
