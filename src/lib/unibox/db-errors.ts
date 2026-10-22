export type UniboxDbErrorKind = "SCHEMA_MISSING" | "RELATIONSHIP_MISMATCH";

export function classifyUniboxDbError(error: { code?: string; message?: string }): UniboxDbErrorKind | null {
  const hint = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    hint.includes("conversations") ||
    hint.includes("unibox_internal_notes") ||
    hint.includes("schema cache")
  ) {
    return "SCHEMA_MISSING";
  }
  if (hint.includes("note_lead_conversation_mismatch") || hint.includes("note_workspace_mismatch")) {
    return "RELATIONSHIP_MISMATCH";
  }
  return null;
}
