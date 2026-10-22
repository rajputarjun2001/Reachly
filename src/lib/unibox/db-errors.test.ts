import { describe, expect, it } from "vitest";
import { classifyUniboxDbError } from "./db-errors";

describe("classifyUniboxDbError", () => {
  it("detects missing unibox tables", () => {
    expect(classifyUniboxDbError({ code: "42P01", message: "relation missing" })).toBe("SCHEMA_MISSING");
    expect(classifyUniboxDbError({ message: "Could not find unibox_internal_notes in schema cache" })).toBe(
      "SCHEMA_MISSING",
    );
  });

  it("detects cross-workspace note relationship errors", () => {
    expect(classifyUniboxDbError({ message: "note_workspace_mismatch" })).toBe("RELATIONSHIP_MISMATCH");
    expect(classifyUniboxDbError({ message: "note_lead_conversation_mismatch" })).toBe("RELATIONSHIP_MISMATCH");
  });

  it("returns null for unrelated errors", () => {
    expect(classifyUniboxDbError({ code: "23505" })).toBeNull();
  });
});
