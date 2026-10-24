import "server-only";

import * as uniboxDomain from "@server/domain/unibox";
import type { ConversationDoc, InternalNoteDoc } from "@server/models";
import { badRequest } from "@server/utils/errors";
import { ensureDb } from "@/lib/server/backend";
import { requireAuthContext } from "@/lib/workspace/context";
import { CONVERSATIONS_PAGE_SIZE } from "./constants";
import type {
  ConversationSummary,
  ConversationWithMessages,
  InternalNoteRow,
  MessageDirection,
  MessageRow,
  PaginatedConversations,
} from "./types";
import {
  validateConversationStatus,
  validateConversationTitle,
  validateInternalNoteBody,
  validateInternalNoteKind,
  validateInternalNoteParents,
  validateMessageBody,
} from "./validation";

type PopulatedLead = { _id: unknown; firstName?: string; lastName?: string; company?: string; title?: string; linkedinUrl?: string };
type PopulatedCampaign = { _id: unknown; name?: string };
type PopulatedAccount = { _id: unknown; fullName?: string; linkedinEmail?: string; label?: string };

function populated<T>(value: unknown): T | null {
  return value && typeof value === "object" && "_id" in value ? (value as T) : null;
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date().toISOString();
}

const DIRECTION_TO_UI: Record<string, MessageDirection> = {
  sent: "outbound",
  received: "inbound",
  system: "system",
};

function mapConversation(doc: ConversationDoc): ConversationSummary {
  const lead = populated<PopulatedLead>(doc.leadId);
  const campaign = populated<PopulatedCampaign>(doc.campaignId);
  const account = populated<PopulatedAccount>(doc.linkedinAccountId);
  return {
    id: String(doc._id),
    workspace_id: String(doc.workspaceId),
    lead_id: lead ? String(lead._id) : doc.leadId ? String(doc.leadId) : null,
    title: doc.title || doc.participantName || "Conversation",
    status: (doc.status ?? "open") as ConversationSummary["status"],
    last_message_at: doc.lastMessageAt ? iso(doc.lastMessageAt) : null,
    last_message_preview: doc.lastMessagePreview ?? null,
    created_at: iso(doc.get("createdAt")),
    updated_at: iso(doc.get("updatedAt")),
    has_unread: Boolean(doc.hasUnread),
    lead_first_name: lead?.firstName ?? null,
    lead_last_name: lead?.lastName ?? null,
    lead_company: lead?.company ?? null,
    lead_job_title: lead?.title ?? null,
    lead_linkedin_url: lead?.linkedinUrl ?? null,
    campaign_name: campaign?.name ?? null,
    account_label: account ? account.label || account.fullName || account.linkedinEmail || null : null,
    can_reply: Boolean(lead && doc.linkedinAccountId),
  };
}

function mapMessages(doc: ConversationDoc): MessageRow[] {
  return (doc.messages ?? []).map((m) => ({
    id: String(m._id),
    conversation_id: String(doc._id),
    workspace_id: String(doc.workspaceId),
    direction: DIRECTION_TO_UI[m.direction] ?? "system",
    body: m.body ?? "",
    sent_at: iso(m.sentAt),
    created_at: iso(m.sentAt),
  }));
}

function mapNote(note: InternalNoteDoc): InternalNoteRow {
  return {
    id: String(note._id),
    workspace_id: String(note.workspaceId),
    conversation_id: note.conversationId ? String(note.conversationId) : null,
    lead_id: note.leadId ? String(note.leadId) : null,
    kind: note.kind as InternalNoteRow["kind"],
    body: note.body,
    created_at: iso(note.get("createdAt")),
    updated_at: iso(note.get("updatedAt")),
  };
}

async function scoped() {
  const ctx = await requireAuthContext();
  await ensureDb();
  return ctx;
}

export async function listConversations(options?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "open" | "archived" | "all";
  filter?: "all" | "unread" | "replied";
}): Promise<PaginatedConversations> {
  const ctx = await scoped();
  const pageSize = Math.min(50, options?.pageSize ?? CONVERSATIONS_PAGE_SIZE);
  const result = await uniboxDomain.listConversations(ctx, {
    page: options?.page,
    limit: pageSize,
    search: options?.search,
    status: options?.status ?? "open",
    filter: options?.filter ?? "all",
  });
  return {
    conversations: result.conversations.map((c) => mapConversation(c as ConversationDoc)),
    total: result.total,
    page: result.page,
    pageSize,
  };
}

export async function getConversationWithMessages(conversationId: string): Promise<ConversationWithMessages | null> {
  const ctx = await scoped();
  let doc: ConversationDoc;
  try {
    doc = await uniboxDomain.conversationDetail(ctx, conversationId);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 400) return null;
    throw err;
  }
  const notes = await uniboxDomain.listNotes(ctx, { conversationId });
  return {
    ...mapConversation(doc),
    messages: mapMessages(doc),
    internal_notes: notes.map(mapNote).reverse(),
  };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const ctx = await scoped();
  await uniboxDomain.markRead(ctx, conversationId);
}

/** Sends a reply through the conversation's LinkedIn account. */
export async function sendReply(conversationId: string, body: string): Promise<void> {
  const ctx = await scoped();
  const message = validateMessageBody(body);
  if (!message) throw badRequest("Message cannot be empty");
  await uniboxDomain.reply(ctx, conversationId, message);
}

export async function listInternalNotesForLead(leadId: string): Promise<InternalNoteRow[]> {
  const ctx = await scoped();
  const notes = await uniboxDomain.listNotes(ctx, { leadId });
  return notes.filter((n) => !n.conversationId).map(mapNote).reverse();
}

export async function createInternalNote(input: {
  conversation_id?: string | null;
  lead_id?: string | null;
  kind: string;
  body: string;
}): Promise<InternalNoteRow> {
  const ctx = await scoped();
  const parents = validateInternalNoteParents(input.conversation_id, input.lead_id);
  const kind = validateInternalNoteKind(input.kind);
  const body = validateInternalNoteBody(input.body);
  if (!parents || !kind || !body) throw badRequest("Invalid internal note");

  let leadId = parents.leadId;
  if (parents.conversationId && !leadId) {
    const conversation = await uniboxDomain.findConversation(ctx, parents.conversationId);
    leadId = conversation.leadId ? String(conversation.leadId) : null;
  }
  const note = await uniboxDomain.createNote(ctx, {
    conversationId: parents.conversationId,
    leadId,
    kind,
    body,
  });
  return mapNote(note);
}

export async function updateInternalNote(noteId: string, body: string): Promise<InternalNoteRow> {
  const ctx = await scoped();
  const validBody = validateInternalNoteBody(body);
  if (!validBody) throw badRequest("Invalid note content");
  return mapNote(await uniboxDomain.updateNote(ctx, noteId, validBody));
}

export async function deleteInternalNote(noteId: string): Promise<void> {
  const ctx = await scoped();
  await uniboxDomain.deleteNote(ctx, noteId);
}

export async function createConversation(input: {
  title: string;
  lead_id?: string | null;
}): Promise<ConversationSummary> {
  const ctx = await scoped();
  const title = input.title.trim() ? validateConversationTitle(input.title) : "";
  if (title === null) throw badRequest("Invalid conversation title");
  const doc = await uniboxDomain.createConversation(ctx, { title, leadId: input.lead_id ?? null });
  await doc.populate(uniboxDomain.CONVERSATION_POPULATE);
  return mapConversation(doc);
}

export async function updateConversationStatus(conversationId: string, status: string): Promise<void> {
  const ctx = await scoped();
  const valid = validateConversationStatus(status);
  if (!valid) throw badRequest("Invalid status");
  await uniboxDomain.setConversationStatus(ctx, conversationId, valid);
}
