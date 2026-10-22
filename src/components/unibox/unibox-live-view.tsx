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
  messageBubbleClass,
} from "@/lib/unibox/display";
import { fetchConversationDetailAction } from "@/app/(app)/unibox/actions";

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
  const [pending, startTransition] = useTransition();

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
              <div className="chat-compose">
                <textarea
                  rows={2}
                  placeholder="External sending is not available yet"
                  aria-label="Message"
                  disabled
                />
                <button type="button" className="btn btn-primary" disabled title="LinkedIn sending is not implemented">
                  Send
                </button>
              </div>
              <p className="form-hint" style={{ padding: "8px 16px", margin: 0 }}>
                Send does not deliver to LinkedIn. Messages appear only when stored in your workspace database.
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
