"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { DetailActivityChart } from "@/components/charts/detail-activity-chart";
import { Dropdown } from "@/components/ui/dropdown";
import { appRoutes } from "@/lib/routes";
import type { DemoCampaign } from "@/data/demo/campaigns";

const sequenceSteps = [
  {
    label: "Connection Request (Day 0)",
    text:
      "Hi {{first_name}}, I noticed your work in the SaaS space and would love to connect. Building something in the AEC/PropTech intersection — would value your perspective.",
  },
  {
    label: "Follow-up Message (Day 3 after accept)",
    text:
      "Thanks for connecting, {{first_name}}! Quick context — I'm building iDesign.Market, an ERP for interior designers. Curious what tools your teams use for project ops?",
  },
  {
    label: "Value Message (Day 7)",
    text:
      "Sharing a quick case study — reduced a 50-person design firm's billing time by 80% with automated BOQ + invoicing. Happy to share more if relevant to you!",
  },
];

export function CampaignDetailScreen({ campaign }: { campaign: DemoCampaign }) {
  const acceptPct = Math.round((campaign.accepted / campaign.sent) * 100);
  const replyPct = Math.round((campaign.replies / campaign.accepted) * 100);

  return (
    <>
      <div className="header">
        <Link href={appRoutes.campaigns} className="btn btn-ghost btn-sm" style={{ marginRight: 4 }}>
          ← Back
        </Link>
        <div>
          <div className="header-title">{campaign.name}</div>
          <div className="header-sub">{campaign.leads} leads · {campaign.startedLabel.replace("Started ", "Started ")}, 2026</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button type="button" className="btn btn-outline btn-sm">⏸ Pause</button>
          <button type="button" className="btn btn-primary btn-sm">✏️ Edit Sequence</button>
        </div>
      </div>
      <div className="content">
        <div className="stats-grid mb-24">
          <div className="stat-card"><div className="stat-icon" style={{ background: "#EEF2FF" }}>📤</div><div className="stat-val">{campaign.sent}</div><div className="stat-label">Requests Sent</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#ECFDF5" }}>🤝</div><div className="stat-val">{campaign.accepted}</div><div className="stat-label">Accepted ({acceptPct}%)</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#FEF3C7" }}>💬</div><div className="stat-val">{campaign.replies}</div><div className="stat-label">Replied ({replyPct}%)</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#F5F3FF" }}>🗓</div><div className="stat-val">{campaign.meetings}</div><div className="stat-label">Meetings Booked</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Activity (Last 14 days)</div></div>
            <div className="card-body"><DetailActivityChart /></div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Message Sequence</div></div>
            <div className="card-body">
              {sequenceSteps.map((step, i) => (
                <div key={step.label} className="sequence-step">
                  <div className="step-num">{i + 1}</div>
                  <div className="step-body">
                    <div className="step-label">{step.label}</div>
                    <div className="step-text">{step.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Leads</div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <div className="search-input" style={{ maxWidth: 220 }}>
                <Search size={12} strokeWidth={2} color="var(--fg3)" />
                <input placeholder="Search leads…" aria-label="Search leads" />
              </div>
              <select className="form-input form-select" style={{ width: 160, padding: "7px 12px" }} aria-label="Filter by status">
                <option>All statuses</option>
                <option>Pending</option>
                <option>Sent</option>
                <option>Accepted</option>
                <option>Replied</option>
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Company</th><th>Title</th><th>Status</th><th>Last Activity</th><th></th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><div className="flex-center gap-8"><div className="avatar avatar-sm">RK</div><div className="td-main">Rohan Kapoor</div></div></td>
                  <td>ZoomInfo</td><td>Head of Sales</td>
                  <td><span className="badge badge-blue">💬 Replied</span></td>
                  <td className="text-xs color-muted">2h ago</td>
                  <td><Link href={appRoutes.unibox} className="btn btn-ghost btn-sm">View Thread →</Link></td>
                </tr>
                <tr>
                  <td><div className="flex-center gap-8"><div className="avatar avatar-sm" style={{ background: "#10B981" }}>PS</div><div className="td-main">Priya Sharma</div></div></td>
                  <td>Notion</td><td>Product Manager</td>
                  <td><span className="badge badge-green">✅ Accepted</span></td>
                  <td className="text-xs color-muted">1d ago</td>
                  <td>
                    <Dropdown trigger={<button type="button" className="dots-btn">•••</button>}>
                      <div className="dd-item">💬 Send Message</div>
                      <div className="dd-item">👤 View Profile</div>
                      <div className="dd-sep" />
                      <div className="dd-item danger">⛔ Blacklist</div>
                    </Dropdown>
                  </td>
                </tr>
                <tr>
                  <td><div className="flex-center gap-8"><div className="avatar avatar-sm" style={{ background: "#F59E0B" }}>AV</div><div className="td-main">Amit Verma</div></div></td>
                  <td>Freshworks</td><td>Growth Lead</td>
                  <td><span className="badge badge-indigo">📤 Request Sent</span></td>
                  <td className="text-xs color-muted">3d ago</td>
                  <td></td>
                </tr>
                <tr>
                  <td><div className="flex-center gap-8"><div className="avatar avatar-sm" style={{ background: "#EF4444" }}>SN</div><div className="td-main">Sneha Nair</div></div></td>
                  <td>Meesho</td><td>CEO</td>
                  <td><span className="badge badge-gray">⏳ Pending</span></td>
                  <td className="text-xs color-muted">—</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
