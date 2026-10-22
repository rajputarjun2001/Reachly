"use client";

import Link from "next/link";
import { BestDaysChart, ReplyByStepChart } from "@/components/charts/analytics-charts";
import { appRoutes } from "@/lib/routes";

export function AnalyticsPopulated() {
  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Analytics</div>
          <div className="header-sub">Performance insights across all campaigns</div>
        </div>
        <select className="form-input form-select btn-sm" style={{ width: 140 }} aria-label="Date range">
          <option>Last 30 days</option>
          <option>Last 7 days</option>
          <option>All time</option>
        </select>
      </div>
      <div className="content">
        <div className="stats-grid mb-24">
          <div className="stat-card"><div className="stat-icon" style={{ background: "#EEF2FF" }}>📤</div><div className="stat-val">481</div><div className="stat-label">Total Sent (30d)</div><div className="stat-delta delta-up">↑ 18%</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#ECFDF5" }}>🤝</div><div className="stat-val">38%</div><div className="stat-label">Avg Acceptance Rate</div><div className="stat-delta delta-up">↑ 3pts</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#FEF3C7" }}>💬</div><div className="stat-val">24%</div><div className="stat-label">Avg Reply Rate</div><div className="stat-delta delta-up">↑ 5pts</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#F5F3FF" }}>🎯</div><div className="stat-val">26%</div><div className="stat-label">Reply → Meeting Rate</div><div className="stat-delta delta-up">↑ 8pts</div></div>
        </div>
        <div className="grid-2 mb-20">
          <div className="card">
            <div className="card-header"><div className="card-title">Best Days to Send</div></div>
            <div className="card-body"><BestDaysChart /></div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Reply Rate by Message Step</div></div>
            <div className="card-body"><ReplyByStepChart /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Campaign Comparison</div></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Campaign</th><th>Sent</th><th>Accept Rate</th><th>Reply Rate</th><th>Meetings</th><th>Best Message</th></tr>
              </thead>
              <tbody>
                <tr><td className="td-main">SaaS Founders India</td><td>144</td><td><span className="color-green fw-700">36%</span></td><td>27%</td><td>4</td><td><span className="badge badge-indigo">Msg 2</span></td></tr>
                <tr><td className="td-main">AEC Decision Makers</td><td>157</td><td><span className="color-green fw-700">39%</span></td><td>20%</td><td>3</td><td><span className="badge badge-indigo">Msg 1</span></td></tr>
                <tr><td className="td-main">Interior Design Studios</td><td>180</td><td><span className="color-green fw-700">38%</span></td><td>26%</td><td>5</td><td><span className="badge badge-indigo">Msg 2</span></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export function AnalyticsEmpty() {
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
            After your first campaign sends, you&apos;ll see acceptance rates, reply rates, best days to send, and campaign comparisons.
          </div>
          <Link href={appRoutes.campaigns} className="btn btn-primary">Launch a campaign →</Link>
        </div>
      </div>
    </>
  );
}
