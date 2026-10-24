"use server";

import { revalidatePath } from "next/cache";
import { isBackendConfigured } from "@/lib/env";
import {
  createConversation,
  createInternalNote,
  deleteInternalNote,
  getConversationWithMessages,
  listConversations,
  markConversationRead,
  sendReply,
  updateConversationStatus,
  updateInternalNote,
} from "@/lib/unibox/repository";
import type { ConversationWithMessages, InternalNoteRow, PaginatedConversations } from "@/lib/unibox/types";
import { actionErrorMessage } from "@/lib/server/backend";

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

const NOT_CONFIGURED = { error: "Backend is not configured." };

export async function fetchConversationsAction(
  search: string,
  page: number,
  filter: "all" | "unread" | "replied" = "all",
): Promise<UniboxFetchResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const list = await listConversations({ search, page, status: "all", filter });
    return { list };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

/** Loads a thread and clears its unread flag. */
export async function fetchConversationDetailAction(
  conversationId: string,
): Promise<UniboxFetchResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const conversation = await getConversationWithMessages(conversationId);
    if (!conversation) return { error: "Conversation not found." };
    if (conversation.has_unread) {
      await markConversationRead(conversationId);
      conversation.has_unread = false;
    }
    return { conversation };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function createConversationAction(formData: FormData): Promise<UniboxActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const title = String(formData.get("title") ?? "").trim();
  const leadId = String(formData.get("lead_id") ?? "") || null;
  try {
    const conv = await createConversation({ title, lead_id: leadId });
    revalidatePath("/unibox");
    return { success: "Conversation created.", conversationId: conv.id };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function sendReplyAction(conversationId: string, body: string): Promise<UniboxActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await sendReply(conversationId, body);
    revalidatePath("/unibox");
    return { success: "Message sent on LinkedIn." };
  } catch (err) {
    return { error: actionErrorMessage(err, "Could not send the message.") };
  }
}

export async function createInternalNoteAction(
  conversationId: string | null,
  body: string,
  kind: string,
  leadId?: string | null,
): Promise<UniboxActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
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
    return { error: actionErrorMessage(err) };
  }
}

export async function updateInternalNoteAction(noteId: string, body: string): Promise<UniboxActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const note = await updateInternalNote(noteId, body);
    revalidatePath("/unibox");
    return { success: "Note updated.", note };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function deleteInternalNoteAction(noteId: string): Promise<UniboxActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await deleteInternalNote(noteId);
    revalidatePath("/unibox");
    return { success: "Note deleted." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function setConversationStatusAction(
  conversationId: string,
  status: "open" | "archived",
): Promise<UniboxActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await updateConversationStatus(conversationId, status);
    revalidatePath("/unibox");
    return { success: status === "archived" ? "Conversation archived." : "Conversation reopened." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}
