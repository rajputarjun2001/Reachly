import { describe, expect, it } from "vitest";
import { appRoutes } from "./routes";

describe("appRoutes", () => {
  it("builds campaign detail paths", () => {
    expect(appRoutes.campaignDetail("saas-founders-india")).toBe(
      "/campaigns/saas-founders-india",
    );
  });
});
