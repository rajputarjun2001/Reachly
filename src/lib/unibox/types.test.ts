import { describe, expect, it } from "vitest";
import type { InternalNoteRow, MessageRow } from "./types";

describe("unibox types", () => {
  it("keeps internal notes separate from thread messages", () => {
    const message: MessageRow = {
      id: "m1",
      conversation_id: "c1",
      workspace_id: "w1",
      direction: "outbound",
      body: "Hello",
      sent_at: "2026-01-01T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const note: InternalNoteRow = {
      id: "n1",
      workspace_id: "w1",
      conversation_id: "c1",
      lead_id: null,
      kind: "draft",
      body: "Draft text",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    expect(message).toHaveProperty("direction");
    expect(message).toHaveProperty("sent_at");
    expect(note).not.toHaveProperty("direction");
    expect(note).not.toHaveProperty("sent_at");
    expect(note.kind).toBe("draft");
  });
});
