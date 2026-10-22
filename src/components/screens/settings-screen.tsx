"use client";

import { useState } from "react";
import { Dropdown } from "@/components/ui/dropdown";
import { demoWorkspace } from "@/data/demo/workspace";
import type { SettingsPanelId } from "@/lib/routes";

const panels: { id: SettingsPanelId; label: string }[] = [
  { id: "profile", label: "👤 Profile" },
  { id: "workspace", label: "🏢 Workspace" },
  { id: "members", label: "👥 Members" },
  { id: "billing", label: "💳 Billing" },
  { id: "integrations", label: "🔌 Integrations" },
  { id: "blacklist", label: "⛔ Blacklist" },
  { id: "safety", label: "🛡️ Safety" },
];

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      className={`toggle${on ? " on" : ""}`}
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
      aria-label="Toggle setting"
    />
  );
}

export function SettingsScreen() {
  const [panel, setPanel] = useState<SettingsPanelId>("profile");

  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Settings</div>
          <div className="header-sub">Manage your workspace and preferences</div>
        </div>
      </div>
      <div className="content">
        <div className="settings-wrap">
          <div className="settings-nav">
            {panels.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`settings-nav-item${panel === p.id ? " active" : ""}`}
                onClick={() => setPanel(p.id)}
                style={{ width: "100%", border: "none", background: "none", fontFamily: "inherit", textAlign: "left" }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            {panel === "profile" && (
              <div className="settings-panel" id="sProfile">
                <div className="card-header"><div className="card-title">Your Profile</div></div>
                <div className="card-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid var(--border)" }}>
                    <div className="avatar" style={{ width: 60, height: 60, fontSize: 22 }}>A</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{demoWorkspace.user.firstName} {demoWorkspace.user.lastName}</div>
                      <div className="text-xs color-muted">{demoWorkspace.user.email}</div>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }}>Change Photo</button>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label" htmlFor="fn">First Name</label><input id="fn" className="form-input" defaultValue={demoWorkspace.user.firstName} /></div>
                    <div className="form-group"><label className="form-label" htmlFor="ln">Last Name</label><input id="ln" className="form-input" defaultValue={demoWorkspace.user.lastName} /></div>
                  </div>
                  <div className="form-group"><label className="form-label" htmlFor="email">Email</label><input id="email" className="form-input" defaultValue={demoWorkspace.user.email} type="email" /></div>
                  <div className="form-group"><label className="form-label" htmlFor="tz">Timezone</label>
                    <select id="tz" className="form-input form-select"><option>{demoWorkspace.user.timezone}</option><option>Asia/Dubai</option><option>America/New_York</option></select>
                  </div>
                  <button type="button" className="btn btn-primary" disabled>Save Changes (demo)</button>
                </div>
              </div>
            )}
            {panel === "workspace" && (
              <div className="settings-panel" id="sWorkspace">
                <div className="card-header"><div className="card-title">Workspace Settings</div></div>
                <div className="card-body">
                  <div className="form-group"><label className="form-label">Workspace Name</label><input className="form-input" defaultValue={demoWorkspace.name} /></div>
                  <div className="form-group"><label className="form-label">Industry</label>
                    <select className="form-input form-select"><option>Architecture & Engineering</option><option>SaaS</option><option>Real Estate</option></select>
                  </div>
                  <div className="divider" />
                  <div className="flex-between mb-16"><div><div className="fw-700">Daily Connection Limit</div><div className="text-xs color-muted">Max connections per account per day (we recommend 10)</div></div><select className="form-input form-select btn-sm" style={{ width: 90 }}><option>10</option><option>8</option><option>6</option></select></div>
                  <div className="flex-between mb-16"><div><div className="fw-700">Sending Window</div><div className="text-xs color-muted">Only send during these hours (your timezone)</div></div><div style={{ display: "flex", gap: 8 }}><input className="form-input btn-sm" defaultValue="08:00" style={{ width: 90 }} aria-label="Start time" /><input className="form-input btn-sm" defaultValue="20:00" style={{ width: 90 }} aria-label="End time" /></div></div>
                  <div className="flex-between"><div><div className="fw-700">Weekends</div><div className="text-xs color-muted">Send on Saturdays and Sundays</div></div><Toggle /></div>
                  <div className="divider" />
                  <button type="button" className="btn btn-primary" disabled>Save (demo)</button>
                </div>
              </div>
            )}
            {panel === "members" && (
              <div className="settings-panel" id="sMembers">
                <div className="card-header"><div className="card-title">Team Members</div><button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} disabled>＋ Invite Member</button></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last Active</th><th></th></tr></thead>
                    <tbody>
                      <tr><td><div className="flex-center gap-8"><div className="avatar avatar-sm">A</div><div><div className="td-main">Ashish Dhingra</div><div className="td-sub">ashish@idesign.market</div></div></div></td><td><span className="badge badge-indigo">Owner</span></td><td><span className="badge badge-green">Active</span></td><td className="text-xs color-muted">Now</td><td></td></tr>
                      <tr><td><div className="flex-center gap-8"><div className="avatar avatar-sm" style={{ background: "#10B981" }}>R</div><div><div className="td-main">Rundan</div><div className="td-sub">rundan@idesign.market</div></div></div></td><td><span className="badge badge-gray">Member</span></td><td><span className="badge badge-green">Active</span></td><td className="text-xs color-muted">3h ago</td><td>
                        <Dropdown trigger={<button type="button" className="dots-btn">•••</button>}>
                          <div className="dd-item">✏️ Change Role</div>
                          <div className="dd-sep" />
                          <div className="dd-item danger">🚫 Remove</div>
                        </Dropdown>
                      </td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {panel === "billing" && (
              <div className="settings-panel" id="sBilling">
                <div className="card-header"><div className="card-title">Billing & Plan</div></div>
                <div className="card-body">
                  <div style={{ background: "linear-gradient(135deg,var(--primary),#818CF8)", borderRadius: 12, padding: 24, color: "#fff", marginBottom: 24 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>Current Plan (demo)</div>
                    <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Starter <span style={{ opacity: 0.7, fontSize: 16 }}>· $20 / month</span></div>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>1 LinkedIn account · Unlimited campaigns · 10/day limit</div>
                  </div>
                  <button type="button" className="btn btn-primary" disabled>Upgrade to Growth (demo)</button>
                </div>
              </div>
            )}
            {panel === "integrations" && (
              <div className="settings-panel" id="sIntegrations">
                <div className="card-header"><div className="card-title">Integrations</div></div>
                <div className="card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {[
                      ["📊", "HubSpot CRM", "Push accepted leads and replies directly to HubSpot contacts", "Connect"],
                      ["📅", "Calendly", "Attach your booking link to follow-up messages automatically", "Connected"],
                      ["💬", "Slack Notifications", "Get notified when someone replies or accepts your connection", "Connect"],
                    ].map(([icon, title, desc, action]) => (
                      <div key={title} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ fontSize: 28 }}>{icon}</div>
                        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div><div style={{ fontSize: 12, color: "var(--fg2)" }}>{desc}</div></div>
                        {action === "Connected" ? <span className="badge badge-green">Connected</span> : <button type="button" className="btn btn-outline btn-sm" disabled>{action}</button>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {panel === "blacklist" && (
              <div className="settings-panel" id="sBlacklist">
                <div className="card-header"><div className="card-title">Blacklist</div><button type="button" className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }} disabled>＋ Add Domain / Profile</button></div>
                <div className="card-body">
                  <div className="form-hint" style={{ marginBottom: 16 }}>Blacklisted domains or LinkedIn profiles will never receive outreach from any campaign.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                      <span style={{ flex: 1 }}>heyreach.io</span><span className="text-xs color-muted">Domain</span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }}>Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {panel === "safety" && (
              <div className="settings-panel" id="sSafety">
                <div className="card-header"><div className="card-title">Safety Settings</div></div>
                <div className="card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    <div className="flex-between"><div><div className="fw-700">Auto-pause on warning</div><div className="text-xs color-muted">Pause all campaigns if LinkedIn sends a warning to this account</div></div><Toggle defaultOn /></div>
                    <div className="flex-between"><div><div className="fw-700">Random delay between actions</div><div className="text-xs color-muted">Add 30–120 second randomized pauses between each action</div></div><Toggle defaultOn /></div>
                    <div className="flex-between"><div><div className="fw-700">Weekend pause</div><div className="text-xs color-muted">Automatically stop outreach on Saturday–Sunday</div></div><Toggle defaultOn /></div>
                    <div className="flex-between"><div><div className="fw-700">Daily limit hard cap</div><div className="text-xs color-muted">Never exceed the limit even if a campaign requests more</div></div><Toggle defaultOn /></div>
                  </div>
                  <div className="divider" />
                  <div style={{ background: "var(--green-light)", border: "1px solid #A7F3D0", borderRadius: 8, padding: 14, fontSize: 13, color: "#065F46" }}>
                    🛡️ <strong>Safety score (demo): Excellent.</strong> Illustrative metrics only until backend monitoring ships.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
