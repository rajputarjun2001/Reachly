"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { useModals } from "@/context/modal-context";
import { appRoutes } from "@/lib/routes";
import type { CampaignListFilter, CampaignSummary } from "@/lib/campaigns/types";
import {
  deleteCampaignAction,
  renameCampaignAction,
  updateCampaignStatusAction,
} from "@/app/(app)/campaigns/actions";

const FINISHED: CampaignSummary["status"][] = ["archived", "completed", "cancelled", "failed"];

function formatStarted(iso: string) {
  try {
    return `Created ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso))}`;
  } catch {
    return "";
  }
}

function statusBadge(status: CampaignSummary["status"]) {
  if (status === "paused") return { className: "badge badge-amber", label: "⏸ Paused" };
  if (status === "draft") return { className: "badge badge-gray", label: "Draft" };
  if (status === "archived") return { className: "badge badge-gray", label: "Archived" };
  if (status === "active") return { className: "badge badge-green", label: "● Running" };
  if (status === "completed") return { className: "badge badge-green", label: "Completed" };
  if (status === "cancelled") return { className: "badge badge-gray", label: "Cancelled" };
  if (status === "failed") return { className: "badge badge-amber", label: "Failed" };
  return { className: "badge badge-gray", label: status };
}

type CampaignsLiveViewProps = {
  initialCampaigns: CampaignSummary[];
  loadError?: string | null;
};

export function CampaignsLiveView({ initialCampaigns, loadError }: CampaignsLiveViewProps) {
  const router = useRouter();
  const { openModal } = useModals();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [activeTab, setActiveTab] = useState<CampaignListFilter | "all">("all");
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setCampaigns(initialCampaigns);
  }, [initialCampaigns]);

  const counts = useMemo(() => {
    const active = campaigns.filter((c) => c.status === "active").length;
    const draft = campaigns.filter((c) => c.status === "draft").length;
    const archived = campaigns.filter((c) => FINISHED.includes(c.status)).length;
    return { active, draft, archived, all: campaigns.length };
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (activeTab === "active" && c.status !== "active") return false;
      if (activeTab === "draft" && c.status !== "draft") return false;
      if (activeTab === "archived" && !FINISHED.includes(c.status)) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [campaigns, activeTab, search]);

  const tabs = [
    { id: "all" as const, label: "All", count: counts.all },
    { id: "active" as const, label: "Active", count: counts.active },
    { id: "draft" as const, label: "Draft", count: counts.draft },
    { id: "archived" as const, label: "Completed", count: counts.archived },
  ];

  const runStatus = (id: string, status: string) => {
    startTransition(async () => {
      const result = await updateCampaignStatusAction(id, status);
      setActionError(result.error ?? null);
      if (!result.error) router.refresh();
    });
  };

  const onRename = (c: CampaignSummary) => {
    const name = window.prompt("Rename campaign", c.name);
    if (!name || name === c.name) return;
    startTransition(async () => {
      const result = await renameCampaignAction(c.id, name);
      if (!result.error) {
        setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, name } : x)));
        router.refresh();
      }
    });
  };

  const onDelete = (c: CampaignSummary) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    startTransition(async () => {
      const result = await deleteCampaignAction(c.id);
      setActionError(result.error ?? null);
      if (!result.error) {
        setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
        router.refresh();
      }
    });
  };

  if (campaigns.length === 0 && !loadError) {
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
              A campaign pairs a LinkedIn account and a lead list with a connection request and follow-up messages.
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
              Create your first campaign
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {loadError ? (
        <div role="alert" style={{ margin: "12px 24px", padding: 12, background: "var(--red-light)", borderRadius: 8, color: "#B91C1C", fontSize: 13 }}>
          {loadError}
        </div>
      ) : null}
      <div className="header">
        <div>
          <div className="header-title">Campaigns</div>
          <div className="header-sub">
            {counts.active} active · {counts.draft} draft · {counts.archived} completed
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")} disabled={pending}>
          ＋ New Campaign
        </button>
      </div>
      <div className="content">
        {actionError ? (
          <p role="alert" className="form-hint" style={{ color: "var(--red)", marginBottom: 12 }}>{actionError}</p>
        ) : null}
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
            <input
              placeholder="Search campaigns…"
              aria-label="Search campaigns"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="grid-2">
          {filtered.map((c) => {
            const badge = statusBadge(c.status);
            const total = c.stats.total_leads || c.lead_count;
            const progress = total > 0 ? Math.min(100, Math.round((c.stats.connections_sent / total) * 100)) : 0;
            const progressLabel =
              c.status === "draft" ? "Not started" : `${c.stats.connections_sent}/${total} contacted`;
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
                    <button type="button" className="dots-btn" onClick={(e) => e.stopPropagation()}>
                      •••
                    </button>
                  }
                >
                  <div className="dd-item" onClick={() => onRename(c)}>✏️ Edit</div>
                  {c.status === "active" || c.status === "paused" ? (
                    <div className="dd-item" onClick={() => runStatus(c.id, c.status === "paused" ? "active" : "paused")}>
                      {c.status === "paused" ? "▶ Resume" : "⏸ Pause"}
                    </div>
                  ) : null}
                  {c.status !== "archived" && c.status !== "active" ? (
                    <div className="dd-item" onClick={() => runStatus(c.id, "archived")}>📦 Archive</div>
                  ) : null}
                  <div className="dd-sep" />
                  <div className="dd-item danger" onClick={() => onDelete(c)}>🗑 Delete</div>
                </Dropdown>
                <div className="flex-between">
                  <span className={badge.className}>{badge.label}</span>
                  <span className="text-xs color-muted">{formatStarted(c.created_at)}</span>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>{c.name}</div>
                  <div className="text-xs color-muted">
                    {c.lead_count} leads · {c.lead_list_name ?? "No list"} · {c.step_count}-step sequence
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                  <div className="acct-stat"><div className="acct-stat-val">{c.stats.connections_sent}</div><div className="acct-stat-label">Sent</div></div>
                  <div className="acct-stat"><div className="acct-stat-val color-green">{c.stats.connections_accepted}</div><div className="acct-stat-label">Accepted</div></div>
                  <div className="acct-stat"><div className="acct-stat-val color-primary">{c.stats.messages_sent}</div><div className="acct-stat-label">Follow-ups</div></div>
                  <div className="acct-stat"><div className="acct-stat-val color-amber">{c.stats.replied}</div><div className="acct-stat-label">Replies</div></div>
                </div>
                <div>
                  <div className="flex-between mb-4">
                    <span className="text-xs color-muted">Progress</span>
                    <span className="text-xs fw-700 color-muted">{progressLabel}</span>
                  </div>
                  <div className="prog-wrap">
                    <div className="prog-bar" style={{ width: `${progress}%`, background: "var(--primary)" }} />
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
          >
            <div style={{ textAlign: "center", color: "var(--fg2)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>＋</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Create New Campaign</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
