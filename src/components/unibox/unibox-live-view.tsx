"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { appRoutes } from "@/lib/routes";
import type { ConversationSummary, ConversationWithMessages } from "@/lib/unibox/types";
import {
  conversationDisplayName,
  formatRelativeTime,
  initialsFromName,
  internalNoteKindLabel,
  messageBubbleClass,
} from "@/lib/unibox/display";
import type { InternalNoteKind, InternalNoteRow } from "@/lib/unibox/types";
import { MESSAGE_BODY_MAX } from "@/lib/unibox/constants";
import {
  createInternalNoteAction,
  deleteInternalNoteAction,
  fetchConversationDetailAction,
  sendReplyAction,
  setConversationStatusAction,
  updateInternalNoteAction,
} from "@/app/(app)/unibox/actions";

type InboxFilter = "all" | "unread" | "replied";

type UniboxLiveViewProps = {
  initialList: ConversationSummary[];
  initialDetail: ConversationWithMessages | null;
  loadError?: string | null;
};

export function UniboxLiveView({ initialList, initialDetail, loadError }: UniboxLiveViewProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialDetail?.id ?? initialList[0]?.id ?? "");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set(initialDetail ? [initialDetail.id] : []));
  const [replyDraft, setReplyDraft] = useState("");
  const [replyStatus, setReplyStatus] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [sending, startSending] = useTransition();
  const [detail, setDetail] = useState<ConversationWithMessages | null>(initialDetail);
  const [search, setSearch] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteKind, setNoteKind] = useState<InternalNoteKind>("note");
  const [noteFormError, setNoteFormError] = useState<string | null>(null);
  const [noteFormSuccess, setNoteFormSuccess] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [notePending, startNoteTransition] = useTransition();

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    if (initialDetail?.id === selectedId) {
      setDetail(initialDetail);
      return;
    }
    startTransition(async () => {
      const result = await fetchConversationDetailAction(selectedId);
      if (result.error) {
        setDetailError(result.error);
        setDetail(null);
        return;
      }
      setDetailError(null);
      setDetail(result.conversation ?? null);
      setReadIds((prev) => new Set(prev).add(selectedId));
    });
  }, [selectedId, initialDetail]);

  useEffect(() => {
    setReplyDraft("");
    setReplyStatus(null);
    setNoteDraft("");
    setNoteFormError(null);
    setNoteFormSuccess(null);
    setEditingNoteId(null);
    setEditingBody("");
  }, [selectedId]);

  const refreshDetail = (conversationId: string) => {
    startTransition(async () => {
      const result = await fetchConversationDetailAction(conversationId);
      if (result.error) {
        setDetailError(result.error);
        return;
      }
      setDetailError(null);
      setDetail(result.conversation ?? null);
    });
  };

  const handleSaveNote = () => {
    if (!selectedId) return;
    const trimmed = noteDraft.trim();
    if (!trimmed) {
      setNoteFormError("Enter some text before saving.");
      setNoteFormSuccess(null);
      return;
    }
    if (trimmed.length > MESSAGE_BODY_MAX) {
      setNoteFormError(`Content must be ${MESSAGE_BODY_MAX} characters or fewer.`);
      setNoteFormSuccess(null);
      return;
    }
    setNoteFormError(null);
    startNoteTransition(async () => {
      const result = await createInternalNoteAction(selectedId, trimmed, noteKind);
      if (result.error) {
        setNoteFormError(result.error);
        setNoteFormSuccess(null);
        return;
      }
      setNoteDraft("");
      setNoteFormSuccess(result.success ?? "Saved.");
      refreshDetail(selectedId);
    });
  };

  const handleUpdateNote = (note: InternalNoteRow) => {
    const trimmed = editingBody.trim();
    if (!trimmed) {
      setNoteFormError("Note cannot be empty.");
      return;
    }
    if (trimmed.length > MESSAGE_BODY_MAX) {
      setNoteFormError(`Content must be ${MESSAGE_BODY_MAX} characters or fewer.`);
      return;
    }
    setNoteFormError(null);
    startNoteTransition(async () => {
      const result = await updateInternalNoteAction(note.id, trimmed);
      if (result.error) {
        setNoteFormError(result.error);
        return;
      }
      setEditingNoteId(null);
      setEditingBody("");
      setNoteFormSuccess(result.success ?? "Updated.");
      if (selectedId) refreshDetail(selectedId);
    });
  };

  const handleDeleteNote = (noteId: string) => {
    startNoteTransition(async () => {
      const result = await deleteInternalNoteAction(noteId);
      if (result.error) {
        setNoteFormError(result.error);
        return;
      }
      setNoteFormSuccess(result.success ?? "Deleted.");
      if (selectedId) refreshDetail(selectedId);
    });
  };

  const handleSendReply = () => {
    if (!selectedId) return;
    const trimmed = replyDraft.trim();
    if (!trimmed) return;
    if (trimmed.length > MESSAGE_BODY_MAX) {
      setReplyStatus({ type: "error", text: `Message must be ${MESSAGE_BODY_MAX} characters or fewer.` });
      return;
    }
    setReplyStatus(null);
    startSending(async () => {
      const result = await sendReplyAction(selectedId, trimmed);
      if (result.error) {
        setReplyStatus({ type: "error", text: result.error });
        return;
      }
      setReplyDraft("");
      setReplyStatus({ type: "success", text: result.success ?? "Sent." });
      refreshDetail(selectedId);
      router.refresh();
    });
  };

  const handleToggleArchive = () => {
    if (!selectedId || !detail) return;
    const next = detail.status === "archived" ? "open" : "archived";
    startTransition(async () => {
      const result = await setConversationStatusAction(selectedId, next);
      if (result.error) {
        setDetailError(result.error);
        return;
      }
      refreshDetail(selectedId);
      router.refresh();
    });
  };

  const isUnread = (c: ConversationSummary) => c.has_unread && !readIds.has(c.id);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialList.filter((c) => {
      if (inboxFilter === "unread" && !(c.has_unread && !readIds.has(c.id))) return false;
      if (inboxFilter === "replied" && !c.last_message_at) return false;
      if (!q) return true;
      const name = conversationDisplayName(c).toLowerCase();
      return name.includes(q) || (c.last_message_preview ?? "").toLowerCase().includes(q);
    });
  }, [initialList, search, inboxFilter, readIds]);

  const unreadCount = initialList.filter(isUnread).length;

  const selectedMeta = initialList.find((c) => c.id === selectedId) ?? detail;

  if (initialList.length === 0 && !loadError) {
    return (
      <>
        <div className="header">
          <div>
            <div className="header-title">Unibox</div>
            <div className="header-sub">LinkedIn conversations from your connected accounts</div>
          </div>
        </div>
        <div className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 108px)" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>No conversations yet</div>
            <div style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.7, marginBottom: 24 }}>
              Messages are synced from connected LinkedIn accounts every few minutes. Replies to your campaigns will show up here.
            </div>
            <Link href={appRoutes.campaigns} className="btn btn-outline">View campaigns →</Link>
          </div>
        </div>
      </>
    );
  }

  const messages = detail?.messages ?? [];
  const internalNotes = detail?.internal_notes ?? [];

  return (
    <>
      {loadError ? (
        <div role="alert" style={{ margin: "12px 24px", padding: 12, background: "var(--red-light)", borderRadius: 8, color: "#B91C1C", fontSize: 13 }}>
          {loadError}
        </div>
      ) : null}
      <div className="header">
        <div>
          <div className="header-title">Unibox</div>
          <div className="header-sub">
            {initialList.length} conversation{initialList.length === 1 ? "" : "s"} · {unreadCount} unread
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <select
            className="form-input form-select btn-sm"
            style={{ width: 160 }}
            aria-label="Filter conversations"
            value={inboxFilter}
            onChange={(e) => setInboxFilter(e.target.value as InboxFilter)}
          >
            <option value="all">All conversations</option>
            <option value="unread">Unread</option>
            <option value="replied">With messages</option>
          </select>
        </div>
      </div>
      <div className="content" style={{ paddingBottom: 0 }}>
        <div className="unibox-wrap">
          <div className="convo-list">
            <div className="convo-search">
              <div className="search-input" style={{ maxWidth: "100%" }}>
                <Search size={12} strokeWidth={2} color="var(--fg3)" />
                <input
                  placeholder="Search conversations…"
                  aria-label="Search conversations"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm color-muted" style={{ padding: 16 }}>No matches.</p>
            ) : (
              filtered.map((c) => {
                const name = conversationDisplayName(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`convo-item${selectedId === c.id ? " active" : ""}`}
                    onClick={() => setSelectedId(c.id)}
                    style={{ width: "100%", border: "none", background: "none", textAlign: "left", fontFamily: "inherit" }}
                  >
                    <div className="avatar avatar-sm">{initialsFromName(name)}</div>
                    <div className="convo-meta">
                      <div className="flex-between">
                        <div className="convo-name" style={isUnread(c) ? { fontWeight: 800 } : undefined}>
                          {isUnread(c) ? <span aria-label="Unread" style={{ color: "var(--primary)", marginRight: 4 }}>●</span> : null}
                          {name}
                        </div>
                        <div className="convo-time">{formatRelativeTime(c.last_message_at)}</div>
                      </div>
                      <div className="convo-preview">{c.last_message_preview ?? "No messages yet"}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {selectedMeta ? (
            <div className="chat-panel">
              <div className="chat-header">
                <div className="avatar">{initialsFromName(conversationDisplayName(selectedMeta))}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{conversationDisplayName(selectedMeta)}</div>
                  <div className="text-xs color-muted">
                    {[selectedMeta.lead_job_title, selectedMeta.lead_company].filter(Boolean).join(" · ") || selectedMeta.title}
                    {selectedMeta.campaign_name ? ` · ${selectedMeta.campaign_name}` : ""}
                    {selectedMeta.account_label ? ` · via ${selectedMeta.account_label}` : ""}
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  {selectedMeta.lead_linkedin_url ? (
                    <a
                      href={selectedMeta.lead_linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                    >
                      👤 View Profile
                    </a>
                  ) : null}
                  <button type="button" className="btn btn-outline btn-sm" onClick={handleToggleArchive} disabled={pending || !detail}>
                    {detail?.status === "archived" ? "Reopen" : "Archive"}
                  </button>
                </div>
              </div>
              {detailError ? (
                <p className="form-hint" style={{ color: "var(--red)", padding: 12 }} role="alert">{detailError}</p>
              ) : null}
              {pending ? (
                <p className="text-sm color-muted" style={{ padding: 16 }}>Loading messages…</p>
              ) : null}
              <div className="chat-messages">
                {messages.length === 0 && !pending ? (
                  <p className="text-sm color-muted" style={{ textAlign: "center" }}>No messages in this conversation yet.</p>
                ) : (
                  messages.map((m) =>
                    m.direction === "system" ? (
                      <div key={m.id} style={{ fontSize: 11, color: "var(--fg3)", textAlign: "center", padding: 8 }}>
                        {m.body}
                      </div>
                    ) : (
                      <div key={m.id} className={`msg-bubble ${messageBubbleClass(m.direction)}`}>
                        {m.body}
                        <div className={`msg-time${m.direction === "inbound" ? " recv" : ""}`}>
                          {formatRelativeTime(m.sent_at)}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>
              <section
                aria-labelledby="unibox-internal-notes-heading"
                style={{
                  borderTop: "1px solid var(--border)",
                  padding: "12px 16px 16px",
                  background: "var(--bg2, var(--bg))",
                }}
              >
                <div id="unibox-internal-notes-heading" style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  Internal notes & drafts
                </div>
                <p className="form-hint" style={{ margin: "0 0 12px" }}>
                  Saved only in your workspace. These are not sent to LinkedIn and do not appear as delivered messages.
                </p>
                {noteFormError ? (
                  <p className="form-hint" role="alert" style={{ color: "var(--red)", marginBottom: 8 }}>{noteFormError}</p>
                ) : null}
                {noteFormSuccess ? (
                  <p className="form-hint" role="status" style={{ color: "var(--green, #15803d)", marginBottom: 8 }}>{noteFormSuccess}</p>
                ) : null}
                {internalNotes.length === 0 && !notePending ? (
                  <p className="text-sm color-muted" style={{ marginBottom: 12 }}>No internal notes yet for this conversation.</p>
                ) : (
                  <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {internalNotes.map((note) => (
                      <li
                        key={note.id}
                        style={{
                          border: "1px dashed var(--border)",
                          borderRadius: 8,
                          padding: 10,
                          background: "var(--bg)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <span
                            className="text-xs"
                            style={{ fontWeight: 700, color: "var(--fg2)" }}
                          >
                            {internalNoteKindLabel(note.kind)}
                          </span>
                          <span className="text-xs color-muted">{formatRelativeTime(note.updated_at)}</span>
                        </div>
                        {editingNoteId === note.id ? (
                          <>
                            <textarea
                              rows={3}
                              className="form-input"
                              style={{ width: "100%", marginBottom: 8 }}
                              aria-label="Edit internal note"
                              value={editingBody}
                              onChange={(e) => setEditingBody(e.target.value)}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={notePending}
                                onClick={() => handleUpdateNote(note)}
                              >
                                Save changes
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setEditingNoteId(null);
                                  setEditingBody("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{note.body}</p>
                            {note.lead_id && !note.conversation_id ? (
                              <p className="text-xs color-muted" style={{ marginBottom: 8 }}>Attached to lead (no conversation)</p>
                            ) : null}
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setEditingBody(note.body);
                                  setNoteFormError(null);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                disabled={notePending}
                                onClick={() => handleDeleteNote(note.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {notePending ? <p className="text-sm color-muted" style={{ marginBottom: 8 }}>Saving…</p> : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <label className="text-xs color-muted" htmlFor="unibox-note-kind">Type</label>
                  <select
                    id="unibox-note-kind"
                    className="form-input form-select btn-sm"
                    style={{ width: 200 }}
                    value={noteKind}
                    onChange={(e) => setNoteKind(e.target.value as InternalNoteKind)}
                    aria-label="Internal note type"
                  >
                    <option value="note">Internal note</option>
                    <option value="draft">Draft — not sent</option>
                  </select>
                </div>
                <textarea
                  rows={3}
                  className="form-input"
                  style={{ width: "100%", marginBottom: 8 }}
                  placeholder="Write an internal note or draft for your team…"
                  aria-label="New internal note or draft"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={notePending || !selectedId}
                  onClick={handleSaveNote}
                >
                  Save to workspace
                </button>
              </section>
              <div className="chat-compose">
                <textarea
                  rows={2}
                  placeholder={
                    selectedMeta.can_reply
                      ? "Write a reply — it is sent from the connected LinkedIn account"
                      : "Replies need a lead profile and a connected LinkedIn account"
                  }
                  aria-label="Reply message"
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply();
                  }}
                  disabled={!selectedMeta.can_reply || sending}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSendReply}
                  disabled={!selectedMeta.can_reply || sending || !replyDraft.trim()}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
              <p
                className="form-hint"
                role={replyStatus ? "status" : undefined}
                style={{
                  padding: "8px 16px",
                  margin: 0,
                  color: replyStatus?.type === "error" ? "var(--red)" : replyStatus ? "var(--green, #15803d)" : undefined,
                }}
              >
                {replyStatus?.text ??
                  "Send delivers on LinkedIn through a browser session and can take up to a minute. Ctrl+Enter to send."}
              </p>
            </div>
          ) : (
            <div className="chat-panel" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p className="color-muted text-sm">Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
