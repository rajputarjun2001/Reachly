"use client";

import Link from "next/link";
import { ActivityChart } from "@/components/charts/activity-chart";
import { Dropdown } from "@/components/ui/dropdown";
import { useModals } from "@/context/modal-context";
import { appRoutes } from "@/lib/routes";
import { demoCampaigns } from "@/data/demo/campaigns";

export function DashboardPopulated() {
  const { openModal } = useModals();

  return (
    <>
      <p className="form-hint" style={{ padding: "8px 24px 0", margin: 0 }}>
        Demo preview — sample metrics and names are not real. Sign in for your workspace dashboard.
      </p>
      <div className="header">
        <div>
          <div className="header-title">Dashboard</div>
          <div className="header-sub">
            Good morning, Ashish 👋 — Week 3 of your campaign is running smoothly.
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("newCampaign")}>
          ＋ New Campaign
        </button>
      </div>
      <div className="content">
        <div className="safety-banner">
          <div className="safety-banner-icon">🛡️</div>
          <div className="safety-banner-text">
            <strong>Safe mode active (demo).</strong> Illustrative limits: 10 connections/day with
            randomized timing. Real enforcement ships with backend safety controls.
          </div>
          <button type="button" className="btn btn-outline btn-sm" style={{ flexShrink: 0 }}>
            View Safety Log
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#EEF2FF" }}>🔗</div>
            <div className="stat-val">384</div>
            <div className="stat-label">Total Connections Sent</div>
            <div className="stat-delta delta-up">↑ 12% vs last week</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#ECFDF5" }}>✅</div>
            <div className="stat-val">142</div>
            <div className="stat-label">Accepted</div>
            <div className="stat-delta"><span style={{ color: "var(--fg2)" }}>37% acceptance rate</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#FEF3C7" }}>💬</div>
            <div className="stat-val">31</div>
            <div className="stat-label">Replies Received</div>
            <div className="stat-delta delta-up">↑ 22% vs last week</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#F0FDF4" }}>📅</div>
            <div className="stat-val">8</div>
            <div className="stat-label">Meetings Booked</div>
            <div className="stat-delta delta-up">↑ 3 this week</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Outreach Activity</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <span className="chip active">7D</span>
                <span className="chip">30D</span>
                <span className="chip">All</span>
              </div>
            </div>
            <div className="card-body">
              <ActivityChart />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Funnel</div></div>
            <div className="card-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { label: "Sent", value: "384", width: "100%", color: "var(--primary)" },
                  { label: "Accepted", value: "142 (37%)", width: "37%", color: "var(--green)" },
                  { label: "Msg 1 Sent", value: "131 (92%)", width: "34%", color: "var(--blue)" },
                  { label: "Replied", value: "31 (24%)", width: "8%", color: "var(--amber)" },
                  { label: "Meetings", value: "8 (26%)", width: "2%", color: "#F43F5E" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex-between mb-4">
                      <span className="text-sm color-muted">{row.label}</span>
                      <span className="text-sm fw-700">{row.value}</span>
                    </div>
                    <div className="prog-wrap">
                      <div className="prog-bar" style={{ width: row.width, background: row.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Active Campaigns</div>
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
                  <th>Progress</th>
                  <th>Sent</th>
                  <th>Accepted</th>
                  <th>Replies</th>
                  <th>Meetings</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {demoCampaigns.map((c) => {
                  const progress = Math.round((c.sent / c.leads) * 100);
                  const acceptPct = Math.round((c.accepted / c.sent) * 100);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={appRoutes.campaignDetail(c.id)} className="td-main" style={{ color: "inherit", textDecoration: "none" }}>
                          {c.name}
                        </Link>
                        <div className="td-sub">Ashish D. · {c.leads} leads</div>
                      </td>
                      <td>
                        <span className={`badge ${c.status === "paused" ? "badge-amber" : "badge-green"}`}>
                          {c.status === "paused" ? "⏸ Paused" : "● Active"}
                        </span>
                      </td>
                      <td>
                        <div className="prog-wrap" style={{ width: 120 }}>
                          <div
                            className="prog-bar"
                            style={{
                              width: `${progress}%`,
                              background: c.status === "paused" && progress === 100 ? "var(--green)" : "var(--primary)",
                            }}
                          />
                        </div>
                        <div className="text-xs color-muted mt-1">{c.sent}/{c.leads}</div>
                      </td>
                      <td className="fw-700">{c.sent}</td>
                      <td>{c.accepted} <span className="text-xs color-muted">({acceptPct}%)</span></td>
                      <td>{c.replies}</td>
                      <td>{c.meetings}</td>
                      <td>
                        <Dropdown trigger={<button type="button" className="dots-btn">•••</button>}>
                          <div className="dd-item">📊 View Stats</div>
                          <div className="dd-item">{c.status === "paused" ? "▶ Resume" : "⏸ Pause"}</div>
                          <div className="dd-sep" />
                          <div className="dd-item danger">🗑 Delete</div>
                        </Dropdown>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export function DashboardEmpty() {
  const { openModal } = useModals();

  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Dashboard</div>
          <div className="header-sub">Welcome to Reachly — let&apos;s get you set up 👋</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("addAccount")}>
          ＋ Connect LinkedIn
        </button>
      </div>
      <div className="content">
        <div
          style={{
            background: "linear-gradient(135deg,#EEF2FF,#E0E7FF)",
            border: "1px solid #C7D2FE",
            borderRadius: 14,
            padding: 32,
            display: "flex",
            gap: 32,
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "#6366F1", marginBottom: 8 }}>
              Get started
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1E1B4B", marginBottom: 8, lineHeight: 1.2 }}>
              You&apos;re one step away from your first connection
            </div>
            <div style={{ fontSize: 14, color: "#4338CA", lineHeight: 1.6, marginBottom: 20 }}>
              Connect your LinkedIn account, upload a lead list, and launch a campaign in under 5 minutes.
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openModal("addAccount")}>
              Connect LinkedIn Account →
            </button>
          </div>
          <div style={{ fontSize: 80, flexShrink: 0 }}>🚀</div>
        </div>
        <div className="grid-3" style={{ marginBottom: 28 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24 }}>
            <div style={{ width: 28, height: 28, background: "var(--primary)", color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>1</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Connect LinkedIn</div>
            <div style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>
              Use supported connection flows when integrations ship — no password storage in Reachly.
            </div>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => openModal("addAccount")}>
              Connect →
            </button>
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, opacity: 0.5 }}>
            <div style={{ width: 28, height: 28, background: "var(--border)", color: "var(--fg3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>2</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Upload Lead List</div>
            <div style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>Drop a CSV of LinkedIn profile URLs. We recommend 50–200 leads to start.</div>
          </div>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, opacity: 0.5 }}>
            <div style={{ width: 28, height: 28, background: "var(--border)", color: "var(--fg3)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>3</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Launch Campaign</div>
            <div style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>Write a connection note and follow-up messages with conservative daily limits.</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">📚 Quick tips to get 30%+ acceptance rates</div></div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                ["Keep your note short.", "Under 280 characters — a one-liner outperforms a paragraph every time."],
                ["Make it about them.", "Reference their company, role, or a mutual interest. Generic notes get ignored."],
                ["No pitch in message 1.", "Build the connection first. Save the ask for message 2 or 3."],
                ["10/day is the sweet spot.", "Higher limits don't get more replies — they increase platform risk."],
              ].map(([bold, rest]) => (
                <div key={bold} style={{ padding: 14, background: "var(--bg)", borderRadius: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>{bold}</span> {rest}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
