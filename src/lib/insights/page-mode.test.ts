import { describe, expect, it } from "vitest";
import { resolveInsightsPageMode } from "./page-mode";

describe("resolveInsightsPageMode", () => {
  it("uses demo only without Supabase", () => {
    expect(resolveInsightsPageMode(false)).toBe("demo-preview");
    expect(resolveInsightsPageMode(true)).toBe("live");
  });
});
