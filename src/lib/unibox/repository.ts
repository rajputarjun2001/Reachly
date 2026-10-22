import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { CONVERSATIONS_PAGE_SIZE, MESSAGES_PAGE_SIZE } from "./constants";
import type {
  ConversationSummary,
  ConversationWithMessages,
  InternalNoteRow,
  MessageRow,
  PaginatedConversations,
} from "./types";
import { classifyUniboxDbError } from "./db-errors";
import {
  validateConversationStatus,
  validateConversationTitle,
  validateInternalNoteBody,
  validateInternalNoteKind,
  validateInternalNoteParents,
  validateMessageBody,
  validateMessageDirection,
} from "./validation";

export class UniboxDataError extends Error {
  constructor(
    message: string,
    public code: string = "UNIBOX_ERROR",
  ) {
    super(message);
  }
}

function mapSchemaError(error: { code?: string; message?: string }) {
  const kind = classifyUniboxDbError(error);
  if (kind === "SCHEMA_MISSING") {
    throw new UniboxDataError(
      "Unibox tables are missing in this Supabase project.",
      "SCHEMA_MISSING",
    );
  }
  if (kind === "RELATIONSHIP_MISMATCH") {
    throw new UniboxDataError("Note does not match this conversation or workspace.", "VALIDATION");
  }
}

async function getScopedClient() {
  const ctx = await requireWorkspaceContext();
  const supabase = await createClient();
  return { supabase, ctx };
}

function mapConversationRow(row: Record<string, unknown>): ConversationSummary {
  const lead = row.leads as
    | { first_name: string | null; last_name: string | null; company: string | null; job_title: string | null }
    | null
    | undefined;
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    lead_id: row.lead_id as string | null,
    title: row.title as string,
    status: row.status as ConversationSummary["status"],
    last_message_at: row.last_message_at as string | null,
    last_message_preview: row.last_message_preview as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    lead_first_name: lead?.first_name ?? null,
    lead_last_name: lead?.last_name ?? null,
    lead_company: lead?.company ?? null,
    lead_job_title: lead?.job_title ?? null,
  };
}

export async function listConversations(options?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "open" | "archived" | "all";
}): Promise<PaginatedConversations> {
  const { supabase, ctx } = await getScopedClient();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(50, options?.pageSize ?? CONVERSATIONS_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("conversations")
    .select(
      `
      id, workspace_id, lead_id, title, status,
      last_message_at, last_message_preview, created_at, updated_at,
      leads ( first_name, last_name, company, job_title )
    `,
      { count: "exact" },
    )
    .eq("workspace_id", ctx.workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const status = options?.status ?? "open";
  if (status !== "all") query = query.eq("status", status);

  const search = options?.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    query = query.or(`title.ilike.%${escaped}%,last_message_preview.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to load conversations", "LIST_FAILED");
  }

  return {
    conversations: (data ?? []).map((row) => mapConversationRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getConversationWithMessages(
  conversationId: string,
  options?: { messagePage?: number; messagePageSize?: number },
): Promise<ConversationWithMessages | null> {
  const { supabase, ctx } = await getScopedClient();

  const { data: conv, error } = await supabase
    .from("conversations")
    .select(
      `
      id, workspace_id, lead_id, title, status,
      last_message_at, last_message_preview, created_at, updated_at,
      leads ( first_name, last_name, company, job_title )
    `,
    )
    .eq("id", conversationId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to load conversation", "LOAD_FAILED");
  }
  if (!conv) return null;

  const messagePage = Math.max(1, options?.messagePage ?? 1);
  const messagePageSize = Math.min(100, options?.messagePageSize ?? MESSAGES_PAGE_SIZE);
  const msgFrom = (messagePage - 1) * messagePageSize;
  const msgTo = msgFrom + messagePageSize - 1;

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id, conversation_id, workspace_id, direction, body, sent_at, created_at")
    .eq("conversation_id", conversationId)
    .eq("workspace_id", ctx.workspaceId)
    .order("sent_at", { ascending: true })
    .range(msgFrom, msgTo);

  if (msgError) {
    mapSchemaError(msgError);
    throw new UniboxDataError("Failed to load messages", "LOAD_FAILED");
  }

  const internalNotes = await listInternalNotesForConversation(conversationId, supabase, ctx.workspaceId);

  return {
    ...mapConversationRow(conv as Record<string, unknown>),
    messages: (messages ?? []) as MessageRow[],
    internal_notes: internalNotes,
  };
}

async function listInternalNotesForConversation(
  conversationId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<InternalNoteRow[]> {
  const { data, error } = await supabase
    .from("unibox_internal_notes")
    .select("id, workspace_id, conversation_id, lead_id, kind, body, created_at, updated_at")
    .eq("conversation_id", conversationId)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: true });

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to load internal notes", "LOAD_FAILED");
  }

  return (data ?? []) as InternalNoteRow[];
}

export async function listInternalNotesForLead(leadId: string): Promise<InternalNoteRow[]> {
  const { supabase, ctx } = await getScopedClient();
  await assertLeadInWorkspace(leadId, ctx.workspaceId, supabase);

  const { data, error } = await supabase
    .from("unibox_internal_notes")
    .select("id, workspace_id, conversation_id, lead_id, kind, body, created_at, updated_at")
    .eq("lead_id", leadId)
    .eq("workspace_id", ctx.workspaceId)
    .is("conversation_id", null)
    .order("updated_at", { ascending: true });

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to load lead notes", "LOAD_FAILED");
  }

  return (data ?? []) as InternalNoteRow[];
}

async function getInternalNoteById(noteId: string): Promise<InternalNoteRow | null> {
  const { supabase, ctx } = await getScopedClient();
  const { data, error } = await supabase
    .from("unibox_internal_notes")
    .select("id, workspace_id, conversation_id, lead_id, kind, body, created_at, updated_at")
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to load note", "LOAD_FAILED");
  }

  return (data as InternalNoteRow | null) ?? null;
}

export async function createInternalNote(input: {
  conversation_id?: string | null;
  lead_id?: string | null;
  kind: string;
  body: string;
}): Promise<InternalNoteRow> {
  const { supabase, ctx } = await getScopedClient();
  const parents = validateInternalNoteParents(input.conversation_id, input.lead_id);
  const kind = validateInternalNoteKind(input.kind);
  const body = validateInternalNoteBody(input.body);
  if (!parents || !kind || !body) {
    throw new UniboxDataError("Invalid internal note", "VALIDATION");
  }

  const conversationId = parents.conversationId;
  let leadId = parents.leadId;

  if (conversationId) {
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, lead_id")
      .eq("id", conversationId)
      .eq("workspace_id", ctx.workspaceId)
      .maybeSingle();
    if (convError) {
      mapSchemaError(convError);
      throw new UniboxDataError("Failed to load conversation", "LOAD_FAILED");
    }
    if (!conv) throw new UniboxDataError("Conversation not found", "NOT_FOUND");
    if (leadId && conv.lead_id && leadId !== conv.lead_id) {
      throw new UniboxDataError("Lead does not match this conversation", "VALIDATION");
    }
    if (!leadId && conv.lead_id) leadId = conv.lead_id;
  } else if (leadId) {
    await assertLeadInWorkspace(leadId, ctx.workspaceId, supabase);
  }

  const { data, error } = await supabase
    .from("unibox_internal_notes")
    .insert({
      workspace_id: ctx.workspaceId,
      conversation_id: conversationId,
      lead_id: leadId,
      kind,
      body,
    })
    .select("id, workspace_id, conversation_id, lead_id, kind, body, created_at, updated_at")
    .single();

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to save internal note", "CREATE_FAILED");
  }

  return data as InternalNoteRow;
}

export async function updateInternalNote(noteId: string, body: string): Promise<InternalNoteRow> {
  const { supabase, ctx } = await getScopedClient();
  const validBody = validateInternalNoteBody(body);
  if (!validBody) throw new UniboxDataError("Invalid note content", "VALIDATION");

  const existing = await getInternalNoteById(noteId);
  if (!existing) throw new UniboxDataError("Note not found", "NOT_FOUND");

  const { data, error } = await supabase
    .from("unibox_internal_notes")
    .update({ body: validBody })
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId)
    .select("id, workspace_id, conversation_id, lead_id, kind, body, created_at, updated_at")
    .single();

  if (error || !data) {
    mapSchemaError(error ?? {});
    throw new UniboxDataError("Failed to update note", "UPDATE_FAILED");
  }

  return data as InternalNoteRow;
}

export async function deleteInternalNote(noteId: string): Promise<void> {
  const { supabase, ctx } = await getScopedClient();
  const existing = await getInternalNoteById(noteId);
  if (!existing) throw new UniboxDataError("Note not found", "NOT_FOUND");

  const { error } = await supabase
    .from("unibox_internal_notes")
    .delete()
    .eq("id", noteId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to delete note", "DELETE_FAILED");
  }
}

async function assertLeadInWorkspace(leadId: string, workspaceId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data) throw new UniboxDataError("Lead not found in this workspace", "VALIDATION");
}

export async function createConversation(input: {
  title: string;
  lead_id?: string | null;
}): Promise<ConversationSummary> {
  const { supabase, ctx } = await getScopedClient();
  const title = validateConversationTitle(input.title);
  if (!title) throw new UniboxDataError("Invalid conversation title", "VALIDATION");

  if (input.lead_id) {
    await assertLeadInWorkspace(input.lead_id, ctx.workspaceId, supabase);
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      workspace_id: ctx.workspaceId,
      title,
      lead_id: input.lead_id ?? null,
      status: "open",
    })
    .select(
      `
      id, workspace_id, lead_id, title, status,
      last_message_at, last_message_preview, created_at, updated_at,
      leads ( first_name, last_name, company, job_title )
    `,
    )
    .single();

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to create conversation", "CREATE_FAILED");
  }

  return mapConversationRow(data as Record<string, unknown>);
}

export async function addMessage(input: {
  conversation_id: string;
  direction: string;
  body: string;
  sent_at?: string;
}): Promise<MessageRow> {
  const { supabase, ctx } = await getScopedClient();
  const direction = validateMessageDirection(input.direction);
  const body = validateMessageBody(input.body);
  if (!direction || !body) throw new UniboxDataError("Invalid message", "VALIDATION");

  const conv = await getConversationWithMessages(input.conversation_id, { messagePage: 1, messagePageSize: 1 });
  if (!conv) throw new UniboxDataError("Conversation not found", "NOT_FOUND");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversation_id,
      workspace_id: ctx.workspaceId,
      direction,
      body,
      sent_at: input.sent_at ?? new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    mapSchemaError(error);
    throw new UniboxDataError("Failed to add message", "CREATE_FAILED");
  }

  return data as MessageRow;
}

export async function updateConversationStatus(conversationId: string, status: string) {
  const { supabase, ctx } = await getScopedClient();
  const valid = validateConversationStatus(status);
  if (!valid) throw new UniboxDataError("Invalid status", "VALIDATION");

  const { data, error } = await supabase
    .from("conversations")
    .update({ status: valid })
    .eq("id", conversationId)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();

  if (error || !data) throw new UniboxDataError("Failed to update conversation", "UPDATE_FAILED");
  return data;
}
