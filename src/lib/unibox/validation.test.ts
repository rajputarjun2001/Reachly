import { describe, expect, it } from "vitest";
import {
  validateConversationTitle,
  validateMessageBody,
  validateMessageDirection,
} from "./validation";

describe("unibox validation", () => {
  it("validates titles and bodies", () => {
    expect(validateConversationTitle("  Thread  ")).toBe("Thread");
    expect(validateConversationTitle("")).toBeNull();
    expect(validateMessageBody("Hello")).toBe("Hello");
    expect(validateMessageBody("   ")).toBeNull();
  });

  it("validates directions", () => {
    expect(validateMessageDirection("inbound")).toBe("inbound");
    expect(validateMessageDirection("invalid")).toBeNull();
  });
});
