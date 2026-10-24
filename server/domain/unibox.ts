import { Conversation, InternalNote, Lead, previewOf, type ConversationDoc } from "../models";
import { AppError, badRequest, notFound, unprocessable } from "../utils/errors";
import { escapeRegex } from "../utils/helpers";
import * as linkedinActions from "../services/playwright/linkedinActions";
import { loadAccountWithSecrets, runWithSession } from "../services/accountSession";
import { logEvent } from "../services/events";
import { oid, type AuthContext } from "./context";

export const CONVERSATION_POPULATE = [
  { path: "leadId", select: "firstName lastName company title linkedinUrl status" },
  { path: "campaignId", select: "name" },
  { path: "linkedinAccountId", select: "fullName linkedinEmail label" },
];

const MAX_MESSAGE = 8000;

function cleanBody(raw: unknown, label = "message") {
  const body = String(raw ?? "").trim();
  if (!body) throw badRequest(`${label} is required`);
  if (body.length > MAX_MESSAGE) throw badRequest(`${label} must be ${MAX_MESSAGE} characters or fewer`);
  return body;
}

export async function findConversation(ctx: AuthContext, id: string): Promise<ConversationDoc> {
  const conversation = await Conversation.findOne({ _id: oid(id, "conversation id"), workspaceId: ctx.workspaceId });
  if (!conversation) throw notFound("Conversation not found");
  return conversation;
}

export type ConversationListOptions = {
  filter?: "all" | "unread" | "replied";
  status?: "open" | "archived" | "all";
  search?: string;
  page?: number;
  limit?: number;
};

export async function listConversations(ctx: AuthContext, opts: ConversationListOptions = {}) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));
  const filter: Record<string, unknown> = { workspaceId: ctx.workspaceId };
  const mode = opts.filter || "all";
  if (mode === "unread") filter.hasUnread = true;
  else if (mode === "replied") filter["messages.direction"] = "received";
  else if (mode !== "all") throw badRequest("filter must be one of unread, all, replied");
  if (opts.status && opts.status !== "all") filter.status = opts.status;
  const q = opts.search?.trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: re }, { participantName: re }, { lastMessagePreview: re }];
  }

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select({ messages: { $slice: -1 } })
      .populate(CONVERSATION_POPULATE),
    Conversation.countDocuments(filter),
  ]);
  return { conversations, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function conversationDetail(ctx: AuthContext, id: string) {
  const conversation = await findConversation(ctx, id);
  await conversation.populate(CONVERSATION_POPULATE);
  return conversation;
}

export async function markRead(ctx: AuthContext, id: string) {
  const conversation = await findConversation(ctx, id);
  if (conversation.hasUnread) {
    conversation.hasUnread = false;
    await conversation.save();
  }
  return conversation;
}

/** Sends a manual reply through the conversation's LinkedIn account and records it. */
export async function reply(ctx: AuthContext, id: string, rawMessage: unknown) {
  const message = cleanBody(rawMessage);
  const conversation = await findConversation(ctx, id);
  const lead = conversation.leadId ? await Lead.findById(conversation.leadId) : null;
  if (!lead) throw unprocessable("This conversation is not linked to a lead profile");
  if (!conversation.linkedinAccountId) throw unprocessable("This conversation has no LinkedIn account to send from");

  const account = await loadAccountWithSecrets(conversation.linkedinAccountId);
  if (!account) throw unprocessable("LinkedIn account for this conversation no longer exists");
  if (account.status !== "active") throw unprocessable(`LinkedIn account is ${account.status}`);

  const result = await runWithSession(account, (cookies, opts) =>
    linkedinActions.sendMessage(cookies, lead.linkedinUrl, message, opts),
  );
  if (!result.success) {
    if (result.flagged) throw unprocessable("LinkedIn account was flagged; reconnect it and try again");
    throw new AppError(502, `Failed to send message: ${result.error || "unknown error"}`);
  }

  const now = new Date();
  conversation.messages.push({ direction: "sent", body: message, sentAt: now });
  conversation.lastMessageAt = now;
  conversation.lastMessagePreview = previewOf(message);
  conversation.hasUnread = false;
  await conversation.save();
  await logEvent({
    workspaceId: conversation.workspaceId,
    linkedinAccountId: account._id,
    campaignId: conversation.campaignId,
    leadId: lead._id,
    eventType: "msg_sent_manual",
    payload: { conversationId: String(conversation._id), userId: ctx.userId },
  });
  return conversation;
}

export async function createConversation(ctx: AuthContext, input: { leadId?: string | null; title?: unknown }) {
  let title = input.title ? String(input.title).trim() : "";
  let leadId = null;
  if (input.leadId) {
    const lead = await Lead.findOne({ _id: oid(input.leadId, "lead id"), workspaceId: ctx.workspaceId });
    if (!lead) throw notFound("Lead not found");
    leadId = lead._id;
    if (!title) title = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  }
  if (!title) throw badRequest("A title or lead is required");
  return Conversation.create({ workspaceId: ctx.workspaceId, leadId, title, participantName: title });
}

/** Records a message locally without sending it to LinkedIn (e.g. a call log). */
export async function addLocalMessage(
  ctx: AuthContext,
  id: string,
  input: { direction: "sent" | "received" | "system"; body: unknown },
) {
  const conversation = await findConversation(ctx, id);
  const body = cleanBody(input.body);
  const now = new Date();
  conversation.messages.push({ direction: input.direction, body, sentAt: now });
  conversation.lastMessageAt = now;
  conversation.lastMessagePreview = previewOf(body);
  await conversation.save();
  return conversation;
}

export async function setConversationStatus(ctx: AuthContext, id: string, status: "open" | "archived") {
  if (status !== "open" && status !== "archived") throw badRequest("Invalid status");
  const conversation = await findConversation(ctx, id);
  conversation.status = status;
  await conversation.save();
  return conversation;
}

export async function listNotes(ctx: AuthContext, input: { leadId?: string | null; conversationId?: string | null }) {
  const or: Record<string, unknown>[] = [];
  if (input.leadId) or.push({ leadId: oid(input.leadId, "lead id") });
  if (input.conversationId) or.push({ conversationId: oid(input.conversationId, "conversation id") });
  if (!or.length) return [];
  return InternalNote.find({ workspaceId: ctx.workspaceId, $or: or }).sort({ createdAt: -1 });
}

export async function createNote(
  ctx: AuthContext,
  input: { leadId?: string | null; conversationId?: string | null; kind?: "note" | "draft"; body: unknown },
) {
  if (!input.leadId && !input.conversationId) throw badRequest("A lead or conversation is required");
  if (input.conversationId) await findConversation(ctx, input.conversationId);
  if (input.leadId && !(await Lead.exists({ _id: oid(input.leadId, "lead id"), workspaceId: ctx.workspaceId }))) {
    throw notFound("Lead not found");
  }
  return InternalNote.create({
    workspaceId: ctx.workspaceId,
    leadId: input.leadId || null,
    conversationId: input.conversationId || null,
    kind: input.kind === "draft" ? "draft" : "note",
    body: cleanBody(input.body, "Note"),
    createdBy: ctx.userId,
  });
}

export async function updateNote(ctx: AuthContext, id: string, body: unknown) {
  const note = await InternalNote.findOne({ _id: oid(id, "note id"), workspaceId: ctx.workspaceId });
  if (!note) throw notFound("Note not found");
  note.body = cleanBody(body, "Note");
  await note.save();
  return note;
}

export async function deleteNote(ctx: AuthContext, id: string) {
  const note = await InternalNote.findOneAndDelete({ _id: oid(id, "note id"), workspaceId: ctx.workspaceId });
  if (!note) throw notFound("Note not found");
  return { id: String(note._id) };
}
