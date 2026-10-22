import { MESSAGE_BODY_MAX } from "./constants";
import type { ConversationStatus, MessageDirection } from "./types";

const STATUSES: ConversationStatus[] = ["open", "archived"];
const DIRECTIONS: MessageDirection[] = ["outbound", "inbound", "system"];

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
