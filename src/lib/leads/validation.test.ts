import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeLinkedInUrl, validateLeadListName } from "./validation";

describe("lead validation", () => {
  it("normalizes email", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(normalizeEmail("bad")).toBeNull();
  });

  it("validates linkedin URLs", () => {
    expect(normalizeLinkedInUrl("linkedin.com/in/foo")).toMatch(/linkedin\.com/);
    expect(normalizeLinkedInUrl("https://evil.com/in/foo")).toBeNull();
  });

  it("validates list names", () => {
    expect(validateLeadListName("  My List  ")).toBe("My List");
    expect(validateLeadListName("")).toBeNull();
  });
});
