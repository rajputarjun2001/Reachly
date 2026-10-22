"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import {
  createConversation,
  createInternalNote,
  deleteInternalNote,
  getConversationWithMessages,
  listConversations,
  updateConversationStatus,
  updateInternalNote,
  UniboxDataError,
} from "@/lib/unibox/repository";
import type { ConversationWithMessages, InternalNoteRow, PaginatedConversations } from "@/lib/unibox/types";

export type UniboxActionResult = {
  error?: string;
  success?: string;
  conversationId?: string;
  note?: InternalNoteRow;
};

export type UniboxFetchResult = {
  error?: string;
  list?: PaginatedConversations;
  conversation?: ConversationWithMessages;
};

function mapError(err: unknown): string {
  if (err instanceof UniboxDataError) return err.message;
  return "Something went wrong. Please try again.";
}

export async function fetchConversationsAction(
  search: string,
  page: number,
): Promise<UniboxFetchResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const list = await listConversations({ search, page, status: "all" });
    return { list };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function fetchConversationDetailAction(
  conversationId: string,
): Promise<UniboxFetchResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const conversation = await getConversationWithMessages(conversationId);
    if (!conversation) return { error: "Conversation not found." };
    return { conversation };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function createConversationAction(formData: FormData): Promise<UniboxActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const title = String(formData.get("title") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "") || null;
  try {
    const conv = await createConversation({ title, lead_id: leadId });
    revalidatePath("/unibox");
    return { success: "Conversation created.", conversationId: conv.id };
  } catch (err) {
    return { error: mapError(err) };
  }
}

/**
 * @deprecated Use createInternalNoteAction — does not create thread messages.
 * Kept for compatibility; stores an internal draft, not an outbound message.
 */
export async function saveLocalMessageAction(
  conversationId: string,
  body: string,
): Promise<UniboxActionResult> {
  return createInternalNoteAction(conversationId, body, "draft");
}

export async function createInternalNoteAction(
  conversationId: string | null,
  body: string,
  kind: string,
  leadId?: string | null,
): Promise<UniboxActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const note = await createInternalNote({
      conversation_id: conversationId,
      lead_id: leadId ?? null,
      kind,
      body,
    });
    revalidatePath("/unibox");
    return {
      success: kind === "draft" ? "Draft saved (not sent)." : "Internal note saved.",
      note,
    };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function updateInternalNoteAction(noteId: string, body: string): Promise<UniboxActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const note = await updateInternalNote(noteId, body);
    revalidatePath("/unibox");
    return { success: "Note updated.", note };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function deleteInternalNoteAction(noteId: string): Promise<UniboxActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await deleteInternalNote(noteId);
    revalidatePath("/unibox");
    return { success: "Note deleted." };
  } catch (err) {
    return { error: mapError(err) };
  }
}

export async function archiveConversationAction(conversationId: string): Promise<UniboxActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await updateConversationStatus(conversationId, "archived");
    revalidatePath("/unibox");
    return { success: "Conversation archived." };
  } catch (err) {
    return { error: mapError(err) };
  }
}
