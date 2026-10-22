"use client";

import Link from "next/link";
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
  updateInternalNoteAction,
} from "@/app/(app)/unibox/actions";

type UniboxLiveViewProps = {
  initialList: ConversationSummary[];
  initialDetail: ConversationWithMessages | null;
  loadError?: string | null;
};

export function UniboxLiveView({ initialList, initialDetail, loadError }: UniboxLiveViewProps) {
  const [selectedId, setSelectedId] = useState(initialDetail?.id ?? initialList[0]?.id ?? "");
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
    });
  }, [selectedId, initialDetail]);

  useEffect(() => {
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialList;
    return initialList.filter((c) => {
      const name = conversationDisplayName(c).toLowerCase();
      return name.includes(q) || (c.last_message_preview ?? "").toLowerCase().includes(q);
    });
  }, [initialList, search]);

  const selectedMeta = initialList.find((c) => c.id === selectedId) ?? detail;

  if (initialList.length === 0 && !loadError) {
    return (
      <>
        <div className="header">
          <div>
            <div className="header-title">Unibox</div>
            <div className="header-sub">Workspace inbox (no LinkedIn sync yet)</div>
          </div>
        </div>
        <div className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 108px)" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>No conversations yet</div>
            <div style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.7, marginBottom: 24 }}>
              Replies from LinkedIn will appear here after a supported integration syncs them. Live mode never shows sample threads.
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
          <div className="header-sub">Persisted conversations in your workspace</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <select className="form-input form-select btn-sm" style={{ width: 160 }} disabled aria-label="Filter by account">
            <option>Accounts (coming soon)</option>
          </select>
          <select className="form-input form-select btn-sm" style={{ width: 140 }} disabled aria-label="Filter by campaign">
            <option>Campaigns (coming soon)</option>
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
                        <div className="convo-name">{name}</div>
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
                  </div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-outline btn-sm" disabled title="Integration not available">
                    👤 View Profile
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled title="Integration not available">
                    🗓 Book Meeting
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
                  placeholder="External sending is not available yet"
                  aria-label="Outbound message (disabled)"
                  disabled
                />
                <button type="button" className="btn btn-primary" disabled title="LinkedIn sending is not implemented" aria-disabled="true">
                  Send
                </button>
              </div>
              <p className="form-hint" style={{ padding: "8px 16px", margin: 0 }}>
                Send does not deliver to LinkedIn. Thread messages appear only from sync or future sending features—not from internal notes above.
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
