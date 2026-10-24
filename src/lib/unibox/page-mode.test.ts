import { describe, expect, it } from "vitest";
import { resolveUniboxPageMode } from "./page-mode";

describe("resolveUniboxPageMode", () => {
  it("uses demo only when the backend is not configured", () => {
    expect(resolveUniboxPageMode(false)).toBe("demo-preview");
    expect(resolveUniboxPageMode(true)).toBe("live");
  });
});
