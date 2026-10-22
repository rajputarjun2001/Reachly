import { MESSAGE_BODY_MAX } from "./constants";
import type { ConversationStatus, InternalNoteKind, MessageDirection } from "./types";

const STATUSES: ConversationStatus[] = ["open", "archived"];
const DIRECTIONS: MessageDirection[] = ["outbound", "inbound", "system"];
const INTERNAL_NOTE_KINDS: InternalNoteKind[] = ["note", "draft"];

export function validateConversationTitle(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > 200) return null;
  return trimmed;
}

export function validateConversationStatus(status: string): ConversationStatus | null {
  return STATUSES.includes(status as ConversationStatus) ? (status as ConversationStatus) : null;
}

export function validateMessageDirection(direction: string): MessageDirection | null {
  return DIRECTIONS.includes(direction as MessageDirection) ? (direction as MessageDirection) : null;
}

export function validateMessageBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > MESSAGE_BODY_MAX) return null;
  return trimmed;
}

export function validateInternalNoteBody(body: string): string | null {
  return validateMessageBody(body);
}

export function validateInternalNoteKind(kind: string): InternalNoteKind | null {
  return INTERNAL_NOTE_KINDS.includes(kind as InternalNoteKind) ? (kind as InternalNoteKind) : null;
}

export function validateInternalNoteParents(
  conversationId?: string | null,
  leadId?: string | null,
): { conversationId: string | null; leadId: string | null } | null {
  const conversationIdNorm = conversationId?.trim() || null;
  const leadIdNorm = leadId?.trim() || null;
  if (!conversationIdNorm && !leadIdNorm) return null;
  return { conversationId: conversationIdNorm, leadId: leadIdNorm };
}
