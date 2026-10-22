import { describe, expect, it } from "vitest";
import { resolveCampaignsPageMode } from "./page-mode";

describe("resolveCampaignsPageMode", () => {
  it("uses demo only when Supabase is not configured", () => {
    expect(resolveCampaignsPageMode(false)).toBe("demo-preview");
    expect(resolveCampaignsPageMode(true)).toBe("live");
  });
});
