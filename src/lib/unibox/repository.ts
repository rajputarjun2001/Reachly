import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { CONVERSATIONS_PAGE_SIZE, MESSAGES_PAGE_SIZE } from "./constants";
import type {
  ConversationSummary,
  ConversationWithMessages,
  MessageRow,
  PaginatedConversations,
} from "./types";
import {
  validateConversationStatus,
  validateConversationTitle,
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
  const hint = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    hint.includes("conversations") ||
    hint.includes("schema cache")
  ) {
    throw new UniboxDataError(
      "Unibox tables are missing in this Supabase project.",
      "SCHEMA_MISSING",
    );
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

  return {
    ...mapConversationRow(conv as Record<string, unknown>),
    messages: (messages ?? []) as MessageRow[],
  };
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
