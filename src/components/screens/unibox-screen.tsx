"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { demoConversations } from "@/data/demo/conversations";
import { appRoutes } from "@/lib/routes";

export function UniboxPopulated() {
  const [selectedId, setSelectedId] = useState(demoConversations[0]?.id ?? "");
  const selected = demoConversations.find((c) => c.id === selectedId) ?? demoConversations[0];

  return (
    <>
      <p className="form-hint" style={{ padding: "8px 24px 0", margin: 0 }}>
        Demo preview — sample conversations are not stored. Sign in with Supabase for your workspace Unibox.
      </p>
      <div className="header">
        <div>
          <div className="header-title">Unibox</div>
          <div className="header-sub">All LinkedIn replies in one place</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <select className="form-input form-select btn-sm" style={{ width: 160 }} aria-label="Filter by account">
            <option>All Accounts</option>
            <option>Ashish Dhingra</option>
          </select>
          <select className="form-input form-select btn-sm" style={{ width: 140 }} aria-label="Filter by campaign">
            <option>All Campaigns</option>
            <option>SaaS Founders</option>
          </select>
        </div>
      </div>
      <div className="content" style={{ paddingBottom: 0 }}>
        <div className="unibox-wrap">
          <div className="convo-list">
            <div className="convo-search">
              <div className="search-input" style={{ maxWidth: "100%" }}>
                <Search size={12} strokeWidth={2} color="var(--fg3)" />
                <input placeholder="Search conversations…" aria-label="Search conversations" />
              </div>
            </div>
            {demoConversations.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`convo-item${c.unread ? " unread" : ""}${selectedId === c.id ? " active" : ""}`}
                onClick={() => setSelectedId(c.id)}
                style={{ width: "100%", border: "none", background: "none", textAlign: "left", fontFamily: "inherit" }}
              >
                <div className="avatar avatar-sm" style={c.avatarColor ? { background: c.avatarColor } : undefined}>
                  {c.initials}
                </div>
                <div className="convo-meta">
                  <div className="flex-between">
                    <div className="convo-name">{c.name}</div>
                    <div className="convo-time">{c.time}</div>
                  </div>
                  <div className="convo-preview">{c.preview}</div>
                </div>
                {c.unread ? <div className="unread-dot" /> : null}
              </button>
            ))}
          </div>
          {selected && (
            <div className="chat-panel">
              <div className="chat-header">
                <div className="avatar">{selected.initials}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.name}</div>
                  <div className="text-xs color-muted">{selected.title} · {selected.company} · {selected.campaign}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-outline btn-sm">👤 View Profile</button>
                  <button type="button" className="btn btn-primary btn-sm">🗓 Book Meeting</button>
                </div>
              </div>
              <div className="chat-messages">
                {selected.messages.length === 0 ? (
                  <p className="text-sm color-muted" style={{ textAlign: "center" }}>Demo thread preview — select Rohan Kapoor for full history.</p>
                ) : (
                  selected.messages.map((m) =>
                    m.type === "divider" ? (
                      <div key={m.id} style={{ fontSize: 11, color: "var(--fg3)", textAlign: "center", padding: 8 }}>
                        {m.divider}
                      </div>
                    ) : (
                      <div key={m.id} className={`msg-bubble ${m.type}`}>
                        {m.text}
                        <div className={`msg-time${m.type === "recv" ? " recv" : ""}`}>{m.time}</div>
                      </div>
                    ),
                  )
                )}
              </div>
              <div className="chat-compose">
                <textarea rows={2} placeholder="Type a message… use {{first_name}} for personalization" aria-label="Message" />
                <button type="button" className="btn btn-primary" disabled title="Demo only">Send</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function UniboxEmpty() {
  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Unibox</div>
          <div className="header-sub">All LinkedIn replies in one place</div>
        </div>
      </div>
      <div className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 108px)" }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>💬</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>No replies yet</div>
          <div style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.7, marginBottom: 24 }}>
            Once your connections start replying, all conversations appear here — from every LinkedIn account, across all campaigns, in one inbox.
          </div>
          <Link href={appRoutes.campaigns} className="btn btn-outline">View campaigns →</Link>
        </div>
      </div>
    </>
  );
}
