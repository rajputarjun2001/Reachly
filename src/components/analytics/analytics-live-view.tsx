"use client";

import Link from "next/link";
import { CountBarChart, LeadsTrendChart, OutreachTrendChart } from "@/components/charts/insights-charts";
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
              Import leads and start a campaign to see acceptance and reply rates, daily outreach and the best days to send.
            </div>
            <Link href={appRoutes.leads} className="btn btn-primary">Import leads →</Link>
          </div>
        </div>
      </>
    );
  }

  const { outreach } = data;
  const statusLabels = ["Draft", "Running", "Paused", "Completed", "Archived"];
  const statusValues = [
    data.campaign_by_status.draft,
    data.campaign_by_status.active,
    data.campaign_by_status.paused,
    data.campaign_by_status.completed,
    data.campaign_by_status.archived,
  ];

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
          <div className="header-sub">Outreach performance · last 30 days</div>
        </div>
      </div>
      <div className="content">
        <div className="stats-grid mb-24">
          <div className="stat-card"><div className="stat-icon" style={{ background: "#EEF2FF" }}>📤</div><div className="stat-val">{outreach.connections_sent}</div><div className="stat-label">Requests sent</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#ECFDF5" }}>🤝</div><div className="stat-val">{outreach.acceptance_rate}%</div><div className="stat-label">Acceptance rate ({outreach.connections_accepted})</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#FEF3C7" }}>💬</div><div className="stat-val">{outreach.reply_rate}%</div><div className="stat-label">Reply rate ({outreach.replied})</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#F5F3FF" }}>✉️</div><div className="stat-val">{outreach.messages_sent}</div><div className="stat-label">Messages sent</div></div>
        </div>
        <div className="card mb-20">
          <div className="card-header"><div className="card-title">Daily outreach (last 30 days)</div></div>
          <div className="card-body">
            <OutreachTrendChart series={data.outreach_last_30_days} emptyLabel="No outreach in the last 30 days." />
          </div>
        </div>
        <div className="grid-2 mb-20">
          <div className="card">
            <div className="card-header"><div className="card-title">Acceptance rate by weekday sent</div></div>
            <div className="card-body">
              <CountBarChart
                labels={data.best_days.map((d) => d.day.slice(0, 3))}
                values={data.best_days.map((d) => d.acceptance_rate)}
                datasetLabel="Acceptance %"
                emptyLabel="Send some connection requests to see which days work best."
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
            <div className="card-header"><div className="card-title">Leads created (last 14 days)</div></div>
            <div className="card-body">
              <LeadsTrendChart
                series={data.leads_created_last_30_days.slice(-14)}
                emptyLabel="No leads imported recently."
              />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Campaign performance</div></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Leads</th>
                  <th>Sent</th>
                  <th>Accepted</th>
                  <th>Messages</th>
                  <th>Replies</th>
                  <th>Accept %</th>
                  <th>Reply %</th>
                </tr>
              </thead>
              <tbody>
                {data.campaign_performance.length === 0 ? (
                  <tr><td colSpan={8} className="color-muted text-sm">No campaigns yet.</td></tr>
                ) : (
                  data.campaign_performance.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={appRoutes.campaignDetail(row.id)} className="td-main" style={{ color: "inherit", textDecoration: "none" }}>
                          {row.name}
                        </Link>
                      </td>
                      <td>{row.total_leads}</td>
                      <td>{row.connections_sent}</td>
                      <td>{row.connections_accepted}</td>
                      <td>{row.messages_sent}</td>
                      <td>{row.replied}</td>
                      <td>{row.acceptance_rate}%</td>
                      <td>{row.reply_rate}%</td>
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
