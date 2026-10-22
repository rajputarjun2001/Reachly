"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { useModals } from "@/context/modal-context";
import { appRoutes } from "@/lib/routes";
import { demoCampaigns } from "@/data/demo/campaigns";

const tabs = [
  { id: "all", label: "All", count: 5 },
  { id: "active", label: "Active", count: 3 },
  { id: "draft", label: "Draft", count: 1 },
  { id: "completed", label: "Completed", count: 1 },
] as const;

export function CampaignsPopulated() {
  const router = useRouter();
  const { openModal } = useModals();
  const [activeTab, setActiveTab] = useState<string>("all");

  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Campaigns</div>
          <div className="header-sub">3 active · 1 draft · 1 completed</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
          ＋ New Campaign
        </button>
      </div>
      <div className="content">
        <div className="flex-between mb-20">
          <div className="tabs" style={{ marginBottom: 0, borderBottom: "none" }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tab${activeTab === t.id ? " active" : ""}`}
                onClick={() => setActiveTab(t.id)}
                style={{ background: "none", border: "none", fontFamily: "inherit" }}
              >
                {t.label} <span className="tab-count">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="search-input">
            <Search size={14} strokeWidth={2} color="var(--fg3)" aria-hidden />
            <input placeholder="Search campaigns…" aria-label="Search campaigns" />
          </div>
        </div>
        <div className="grid-2">
          {demoCampaigns.map((c) => {
            const progress = Math.round((c.sent / c.leads) * 100);
            return (
              <div
                key={c.id}
                className="campaign-card"
                style={{ cursor: "pointer" }}
                role="link"
                tabIndex={0}
                onClick={() => router.push(appRoutes.campaignDetail(c.id))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(appRoutes.campaignDetail(c.id));
                }}
              >
                <Dropdown
                  trigger={
                    <button
                      type="button"
                      className="dots-btn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      •••
                    </button>
                  }
                >
                  <div className="dd-item">✏️ Edit</div>
                  <div className="dd-item">{c.status === "paused" ? "▶ Resume" : "⏸ Pause"}</div>
                  <div className="dd-item">📋 Duplicate</div>
                  <div className="dd-sep" />
                  <div className="dd-item danger">🗑 Delete</div>
                </Dropdown>
                <div className="flex-between">
                  <span className={`badge ${c.status === "paused" ? "badge-amber" : "badge-green"}`}>
                    {c.status === "paused" ? "⏸ Paused" : "● Active"}
                  </span>
                  <span className="text-xs color-muted">{c.startedLabel}</span>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>{c.name}</div>
                  <div className="text-xs color-muted">
                    {c.leads} leads · {c.accountName} account · {c.sequenceSteps}-step sequence
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                  <div className="acct-stat"><div className="acct-stat-val">{c.sent}</div><div className="acct-stat-label">Sent</div></div>
                  <div className="acct-stat"><div className="acct-stat-val color-green">{c.accepted}</div><div className="acct-stat-label">Accepted</div></div>
                  <div className="acct-stat"><div className="acct-stat-val color-amber">{c.replies}</div><div className="acct-stat-label">Replies</div></div>
                  <div className="acct-stat"><div className="acct-stat-val color-primary">{c.meetings}</div><div className="acct-stat-label">Meetings</div></div>
                </div>
                <div>
                  <div className="flex-between mb-4">
                    <span className="text-xs color-muted">Progress</span>
                    <span className={`text-xs fw-700${progress === 100 ? " color-green" : ""}`}>
                      {progress === 100 ? "Complete" : `${c.sent}/${c.leads}`}
                    </span>
                  </div>
                  <div className="prog-wrap">
                    <div
                      className="prog-bar"
                      style={{
                        width: `${progress}%`,
                        background: progress === 100 ? "var(--green)" : "var(--primary)",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <div
            className="campaign-card"
            style={{ border: "2px dashed var(--border)", boxShadow: "none", cursor: "pointer", alignItems: "center", justifyContent: "center", minHeight: 200 }}
            onClick={() => openModal("newCampaign")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && openModal("newCampaign")}
          >
            <div style={{ textAlign: "center", color: "var(--fg2)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>＋</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Create New Campaign</div>
              <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>Set up your outreach sequence</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function CampaignsEmpty() {
  const { openModal } = useModals();
  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Campaigns</div>
          <div className="header-sub">No campaigns yet</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
          ＋ New Campaign
        </button>
      </div>
      <div className="content">
        <div className="empty-state" style={{ padding: "80px 24px" }}>
          <div className="empty-icon">📋</div>
          <div className="empty-title">No campaigns yet</div>
          <div className="empty-sub">
            A campaign pairs a lead list with a message sequence. Reachly handles the sending — you just write the messages.
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
            Create your first campaign
          </button>
        </div>
      </div>
    </>
  );
}
