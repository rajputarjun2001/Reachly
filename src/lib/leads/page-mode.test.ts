import { describe, expect, it } from "vitest";
import { resolveLeadsPageMode } from "./page-mode";

describe("resolveLeadsPageMode", () => {
  it("uses demo preview only when the backend is not configured", () => {
    expect(resolveLeadsPageMode(false)).toBe("demo-preview");
    expect(resolveLeadsPageMode(true)).toBe("live");
  });
});
