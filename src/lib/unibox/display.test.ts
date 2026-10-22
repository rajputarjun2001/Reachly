import { describe, expect, it } from "vitest";
import {
  conversationDisplayName,
  initialsFromName,
  internalNoteKindLabel,
  messageBubbleClass,
} from "./display";
import type { ConversationSummary } from "./types";

describe("unibox display", () => {
  it("prefers lead name over title", () => {
    const c: ConversationSummary = {
      id: "1",
      workspace_id: "w",
      lead_id: null,
      title: "Fallback",
      status: "open",
      last_message_at: null,
      last_message_preview: null,
      created_at: "",
      updated_at: "",
      lead_first_name: "Jane",
      lead_last_name: "Doe",
      lead_company: null,
      lead_job_title: null,
    };
    expect(conversationDisplayName(c)).toBe("Jane Doe");
  });

  it("maps message bubble classes", () => {
    expect(messageBubbleClass("inbound")).toBe("recv");
    expect(messageBubbleClass("outbound")).toBe("sent");
  });

  it("builds initials", () => {
    expect(initialsFromName("Rohan Kapoor")).toBe("RK");
  });

  it("labels internal notes separately from thread bubbles", () => {
    expect(internalNoteKindLabel("note")).toBe("Internal note");
    expect(internalNoteKindLabel("draft")).toBe("Draft — not sent");
    expect(messageBubbleClass("outbound")).toBe("sent");
  });
});
