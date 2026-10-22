"use client";

import Link from "next/link";
import { CountBarChart, LeadsTrendChart } from "@/components/charts/insights-charts";
import { appRoutes } from "@/lib/routes";
import type { AnalyticsInsights } from "@/lib/insights/types";
type AnalyticsLiveViewProps = {
  data: AnalyticsInsights;
  loadError?: string | null;
};

export function AnalyticsLiveView({ data, loadError }: AnalyticsLiveViewProps) {
  const hasData = data.total_leads > 0 || data.campaign_count > 0;

  if (!hasData && !loadError) {
    return (
      <>
        <div className="header">
          <div>
            <div className="header-title">Analytics</div>
            <div className="header-sub">No data yet</div>
          </div>
        </div>
        <div className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 108px)" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Analytics will appear here</div>
            <div style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.7, marginBottom: 24 }}>
              Import leads and create campaigns to see workspace counts and trends. Reply and send performance require outreach execution (not available yet).
            </div>
            <Link href={appRoutes.leads} className="btn btn-primary">Import leads →</Link>
          </div>
        </div>
      </>
    );
  }

  const statusLabels = ["Draft", "Active", "Paused", "Archived"];
  const statusValues = [
    data.campaign_by_status.draft,
    data.campaign_by_status.active,
    data.campaign_by_status.paused,
    data.campaign_by_status.archived,
  ];

  const leads30 = data.leads_created_last_30_days;
  const leads30Chart = leads30.map((d) => ({ date: d.date, count: d.count }));

  return (
    <>
      {loadError ? (
        <div role="alert" style={{ margin: "12px 24px", padding: 12, background: "var(--red-light)", borderRadius: 8, color: "#B91C1C", fontSize: 13 }}>
          {loadError}
        </div>
      ) : null}
      <div className="header">
        <div>
          <div className="header-title">Analytics</div>
          <div className="header-sub">Workspace insights (leads &amp; campaigns)</div>
        </div>
      </div>
      <div className="content">
        <p className="form-hint" style={{ marginBottom: 16 }}>
          Send, acceptance, reply, and meeting metrics are unavailable until outreach execution is implemented.
        </p>
        <div className="stats-grid mb-24">
          <div className="stat-card"><div className="stat-icon" style={{ background: "#EEF2FF" }}>👥</div><div className="stat-val">{data.total_leads}</div><div className="stat-label">Total Leads</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#ECFDF5" }}>📋</div><div className="stat-val">{data.lead_list_count}</div><div className="stat-label">Lead Lists</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#FEF3C7" }}>📣</div><div className="stat-val">{data.campaign_count}</div><div className="stat-label">Campaigns</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#F5F3FF" }}>📝</div><div className="stat-val">{data.campaign_by_status.draft}</div><div className="stat-label">Draft Campaigns</div></div>
        </div>
        <div className="grid-2 mb-20">
          <div className="card">
            <div className="card-header"><div className="card-title">Leads by list</div></div>
            <div className="card-body">
              <CountBarChart
                labels={data.leads_by_list.map((l) => l.name)}
                values={data.leads_by_list.map((l) => l.count)}
                datasetLabel="Leads"
                emptyLabel="No lead lists yet."
              />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Campaigns by status</div></div>
            <div className="card-body">
              <CountBarChart
                labels={statusLabels}
                values={statusValues}
                datasetLabel="Campaigns"
                emptyLabel="No campaigns yet."
              />
            </div>
          </div>
        </div>
        <div className="card mb-20">
          <div className="card-header"><div className="card-title">Leads created (last 30 days)</div></div>
          <div className="card-body">
            <LeadsTrendChart
              series={leads30Chart.length > 14 ? leads30Chart.slice(-14) : leads30Chart}
              emptyLabel="No leads imported in the last 30 days."
            />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Campaign overview</div></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>List</th><th>Leads</th><th>Outreach performance</th></tr>
              </thead>
              <tbody>
                {data.leads_by_list.length === 0 ? (
                  <tr><td colSpan={3} className="color-muted text-sm">No lists yet.</td></tr>
                ) : (
                  data.leads_by_list.map((row) => (
                    <tr key={row.list_id}>
                      <td className="td-main">{row.name}</td>
                      <td>{row.count}</td>
                      <td className="text-xs color-muted">Not available yet</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
