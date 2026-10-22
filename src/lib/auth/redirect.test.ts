import { describe, expect, it } from "vitest";
import { getSafeRedirectPath } from "./redirect";

describe("getSafeRedirectPath", () => {
  it("allows internal paths", () => {
    expect(getSafeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(getSafeRedirectPath("/campaigns/saas-founders-india")).toBe(
      "/campaigns/saas-founders-india",
    );
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(getSafeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(getSafeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(getSafeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("rejects auth loop paths", () => {
    expect(getSafeRedirectPath("/login")).toBe("/dashboard");
    expect(getSafeRedirectPath("/signup")).toBe("/dashboard");
  });
});
