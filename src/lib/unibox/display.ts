import type { ConversationSummary, InternalNoteKind, MessageDirection } from "./types";

export function conversationDisplayName(c: ConversationSummary): string {
  const parts = [c.lead_first_name, c.lead_last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return c.title;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `${days}d`;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  } catch {
    return "—";
  }
}

export function messageBubbleClass(direction: MessageDirection): "sent" | "recv" {
  if (direction === "inbound") return "recv";
  return "sent";
}

export function internalNoteKindLabel(kind: InternalNoteKind): string {
  if (kind === "draft") return "Draft — not sent";
  return "Internal note";
}
