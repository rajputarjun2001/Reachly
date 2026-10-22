"use client";

import Link from "next/link";
import { useModals } from "@/context/modal-context";
import { LeadsTrendChart } from "@/components/charts/insights-charts";
import { appRoutes } from "@/lib/routes";
import type { DashboardInsights } from "@/lib/insights/types";
import type { CampaignStatus } from "@/lib/campaigns/types";

function statusBadge(status: CampaignStatus) {
  if (status === "paused") return { className: "badge badge-amber", label: "⏸ Paused" };
  if (status === "draft") return { className: "badge badge-gray", label: "Draft" };
  if (status === "archived") return { className: "badge badge-gray", label: "Archived" };
  return { className: "badge badge-green", label: "● Active (config)" };
}

type DashboardLiveViewProps = {
  data: DashboardInsights;
  greetingName: string;
  loadError?: string | null;
};

export function DashboardLiveView({ data, greetingName, loadError }: DashboardLiveViewProps) {
  const { openModal } = useModals();
  const activeCount = data.campaign_by_status.active;
  const isEmpty =
    data.total_leads === 0 && data.campaign_count === 0 && data.lead_list_count === 0;

  const statusFunnel = [
    { label: "Draft", value: data.campaign_by_status.draft, color: "var(--fg3)" },
    { label: "Active (config)", value: data.campaign_by_status.active, color: "var(--primary)" },
    { label: "Paused", value: data.campaign_by_status.paused, color: "var(--amber)" },
    { label: "Archived", value: data.campaign_by_status.archived, color: "var(--green)" },
  ];
  const maxStatus = Math.max(...statusFunnel.map((s) => s.value), 1);

  if (isEmpty && !loadError) {
    return (
      <>
        <div className="header">
          <div>
            <div className="header-title">Dashboard</div>
            <div className="header-sub">Welcome, {greetingName} — let&apos;s get your workspace set up.</div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
            ＋ New Campaign
          </button>
        </div>
        <div className="content">
          <div className="empty-state" style={{ padding: "60px 24px" }}>
            <div className="empty-icon">📊</div>
            <div className="empty-title">No workspace activity yet</div>
            <div className="empty-sub" style={{ maxWidth: 480, margin: "0 auto 20px" }}>
              Import leads and create a campaign draft to see real metrics here. Outreach performance tracking is not available until sending ships.
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href={appRoutes.leads} className="btn btn-outline">Upload leads</Link>
              <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
                Create campaign
              </button>
            </div>
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
          <div className="header-title">Dashboard</div>
          <div className="header-sub">
            Good morning, {greetingName} 👋 — {data.campaign_count} campaign{data.campaign_count === 1 ? "" : "s"}, {data.total_leads} lead{data.total_leads === 1 ? "" : "s"} in your workspace.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
          ＋ New Campaign
        </button>
      </div>
      <div className="content">
        <div className="safety-banner">
          <div className="safety-banner-icon">ℹ️</div>
          <div className="safety-banner-text">
            <strong>Outreach metrics not available yet.</strong> Sent, accepted, replies, and meetings are not tracked until message sending is implemented. Summary cards below use your saved leads and campaigns only.
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#EEF2FF" }}>👥</div>
            <div className="stat-val">{data.total_leads}</div>
            <div className="stat-label">Total Leads</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#ECFDF5" }}>📋</div>
            <div className="stat-val">{data.lead_list_count}</div>
            <div className="stat-label">Lead Lists</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#FEF3C7" }}>📣</div>
            <div className="stat-val">{data.campaign_count}</div>
            <div className="stat-label">Campaigns</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#F0FDF4" }}>●</div>
            <div className="stat-val">{activeCount}</div>
            <div className="stat-label">Active (configuration)</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Leads added (7 days)</div>
            </div>
            <div className="card-body">
              <LeadsTrendChart series={data.leads_added_last_7_days} />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Campaigns by status</div></div>
            <div className="card-body">
              {data.campaign_count === 0 ? (
                <p className="color-muted text-sm">No campaigns yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {statusFunnel.map((row) => (
                    <div key={row.label}>
                      <div className="flex-between mb-4">
                        <span className="text-sm color-muted">{row.label}</span>
                        <span className="text-sm fw-700">{row.value}</span>
                      </div>
                      <div className="prog-wrap">
                        <div
                          className="prog-bar"
                          style={{
                            width: `${Math.round((row.value / maxStatus) * 100)}%`,
                            background: row.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent campaigns</div>
            <Link href={appRoutes.campaigns} className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }}>
              View all
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th>Leads in list</th>
                  <th>Sequence</th>
                  <th>Outreach</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="color-muted text-sm">No campaigns yet. Create one to get started.</td>
                  </tr>
                ) : (
                  data.recent_campaigns.map((c) => {
                    const badge = statusBadge(c.status);
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={appRoutes.campaignDetail(c.id)} className="td-main" style={{ color: "inherit", textDecoration: "none" }}>
                            {c.name}
                          </Link>
                        </td>
                        <td><span className={badge.className}>{badge.label}</span></td>
                        <td>{c.lead_count}</td>
                        <td>{c.step_count} steps</td>
                        <td className="text-xs color-muted">Not tracked yet</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
