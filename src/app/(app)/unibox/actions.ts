"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import {
  addMessage,
  createConversation,
  getConversationWithMessages,
  listConversations,
  updateConversationStatus,
  UniboxDataError,
} from "@/lib/unibox/repository";
import type { ConversationWithMessages, PaginatedConversations } from "@/lib/unibox/types";

export type UniboxActionResult = {
  error?: string;
  success?: string;
  conversationId?: string;
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

/** Stores a workspace-local note only — does not send externally. */
export async function saveLocalMessageAction(
  conversationId: string,
  body: string,
  direction: string = "outbound",
): Promise<UniboxActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await addMessage({ conversation_id: conversationId, direction, body });
    revalidatePath("/unibox");
    return { success: "Message saved to this workspace (not sent externally)." };
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
