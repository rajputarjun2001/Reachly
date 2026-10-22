import { describe, expect, it } from "vitest";
import {
  validateConversationTitle,
  validateInternalNoteBody,
  validateInternalNoteKind,
  validateInternalNoteParents,
  validateMessageBody,
  validateMessageDirection,
} from "./validation";
import { MESSAGE_BODY_MAX } from "./constants";

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

  it("validates internal note parents and kinds", () => {
    expect(validateInternalNoteParents("conv-1", null)).toEqual({
      conversationId: "conv-1",
      leadId: null,
    });
    expect(validateInternalNoteParents(null, "lead-1")).toEqual({
      conversationId: null,
      leadId: "lead-1",
    });
    expect(validateInternalNoteParents(null, null)).toBeNull();
    expect(validateInternalNoteKind("draft")).toBe("draft");
    expect(validateInternalNoteKind("sent")).toBeNull();
  });

  it("enforces internal note body limits", () => {
    expect(validateInternalNoteBody("team context")).toBe("team context");
    expect(validateInternalNoteBody("")).toBeNull();
    expect(validateInternalNoteBody("x".repeat(MESSAGE_BODY_MAX + 1))).toBeNull();
  });
});
