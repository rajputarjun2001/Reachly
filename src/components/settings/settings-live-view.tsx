"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addBlacklistAction,
  changePasswordAction,
  inviteMemberAction,
  removeBlacklistAction,
  removeMemberAction,
  updateProfileAction,
  updateWorkspaceAction,
} from "@/app/(app)/settings/actions";
import type { SettingsData } from "@/lib/settings/types";
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

const TIMEZONES = ["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Asia/Dubai"];

type Props = {
  data: SettingsData;
  loadError: string | null;
};

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function SettingsLiveView({ data, loadError }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<SettingsPanelId>("profile");
  const [message, setMessage] = useState<string | null>(loadError);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [pending, startTransition] = useTransition();
  const isOwner = data.profile.role === "owner";

  const run = (fn: () => Promise<{ error?: string; success?: string; inviteUrl?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      setMessage(result.error ?? result.success ?? null);
      if (result.inviteUrl) setInviteUrl(result.inviteUrl);
      router.refresh();
    });
  };

  const limitOptions = Array.from({ length: data.workspace.plan_daily_cap }, (_, i) => i + 1);

  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Settings</div>
          <div className="header-sub">Manage your workspace and preferences</div>
        </div>
      </div>
      <div className="content">
        {message ? (
          <p role="status" className="form-hint" style={{ marginBottom: 12 }}>
            {message}
          </p>
        ) : null}
        <div className="settings-wrap">
          <div className="settings-nav">
            {panels.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`settings-nav-item${panel === p.id ? " active" : ""}`}
                onClick={() => {
                  setPanel(p.id);
                  setMessage(null);
                  setInviteUrl(null);
                }}
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
                    <div className="avatar" style={{ width: 60, height: 60, fontSize: 22 }}>{initials(data.profile.full_name, data.profile.email)}</div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{data.profile.full_name || data.profile.email}</div>
                      <div className="text-xs color-muted">{data.profile.email}</div>
                    </div>
                  </div>
                  <form action={(fd) => run(() => updateProfileAction(fd))}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="fullName">Display name</label>
                      <input id="fullName" name="fullName" className="form-input" defaultValue={data.profile.full_name} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="tz">Timezone</label>
                      <select id="tz" name="timezone" className="form-input form-select" defaultValue={data.profile.timezone}>
                        {TIMEZONES.map((tz) => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={pending}>Save profile</button>
                  </form>
                  <div className="divider" />
                  <form action={(fd) => run(() => changePasswordAction(fd))}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="oldPassword">Current password</label>
                      <input id="oldPassword" name="oldPassword" type="password" className="form-input" autoComplete="current-password" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="newPassword">New password</label>
                      <input id="newPassword" name="newPassword" type="password" className="form-input" autoComplete="new-password" minLength={8} required />
                    </div>
                    <button type="submit" className="btn btn-outline" disabled={pending}>Change password</button>
                  </form>
                </div>
              </div>
            )}

            {panel === "workspace" && (
              <div className="settings-panel" id="sWorkspace">
                <div className="card-header"><div className="card-title">Workspace Settings</div></div>
                <div className="card-body">
                  {!isOwner ? (
                    <p className="form-hint">Only the workspace owner can change these settings.</p>
                  ) : (
                    <form action={(fd) => run(() => updateWorkspaceAction(fd))}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="wsName">Workspace name</label>
                        <input id="wsName" name="name" className="form-input" defaultValue={data.workspace.name} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="wsTz">Sending timezone</label>
                        <select id="wsTz" name="timezone" className="form-input form-select" defaultValue={data.workspace.timezone}>
                          {TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-between mb-16">
                        <div>
                          <div className="fw-700">Daily connection limit</div>
                          <div className="text-xs color-muted">Per LinkedIn account (max {data.workspace.plan_daily_cap} on {data.workspace.plan})</div>
                        </div>
                        <select name="dailyLimitPerAccount" className="form-input form-select btn-sm" style={{ width: 90 }} defaultValue={String(data.workspace.daily_limit_per_account)}>
                          {limitOptions.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label" htmlFor="winStart">Window start (hour 0–23)</label>
                          <input id="winStart" name="sendingWindowStart" type="number" min={0} max={23} className="form-input" defaultValue={data.workspace.sending_window_start} />
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="winEnd">Window end (hour 1–24)</label>
                          <input id="winEnd" name="sendingWindowEnd" type="number" min={1} max={24} className="form-input" defaultValue={data.workspace.sending_window_end} />
                        </div>
                      </div>
                      <label className="flex-between" style={{ marginBottom: 16, cursor: "pointer" }}>
                        <span>
                          <span className="fw-700">Send on weekends</span>
                          <div className="text-xs color-muted">Allow outreach on Saturday and Sunday</div>
                        </span>
                        <input type="hidden" name="sendOnWeekends" value="false" />
                        <input type="checkbox" name="sendOnWeekends" value="true" defaultChecked={data.workspace.send_on_weekends} />
                      </label>
                      <button type="submit" className="btn btn-primary" disabled={pending}>Save workspace</button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {panel === "members" && (
              <div className="settings-panel" id="sMembers">
                <div className="card-header">
                  <div className="card-title">Team Members</div>
                </div>
                {isOwner ? (
                  <div className="card-body" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 2 }}>
                        <label className="form-label" htmlFor="inviteEmail">Email</label>
                        <input id="inviteEmail" className="form-input" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                      </div>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label className="form-label" htmlFor="inviteName">Name (optional)</label>
                        <input id="inviteName" className="form-input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ alignSelf: "end" }}
                        disabled={pending || !inviteEmail.trim()}
                        onClick={() => run(() => inviteMemberAction(inviteEmail, inviteName))}
                      >
                        Invite
                      </button>
                    </div>
                    {inviteUrl ? (
                      <>
                        <p className="form-hint">Share this invite link (expires in 14 days):</p>
                        <input className="form-input" readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
                      </>
                    ) : null}
                  </div>
                ) : null}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Last active</th><th /></tr></thead>
                    <tbody>
                      {data.members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <div className="flex-center gap-8">
                              <div className="avatar avatar-sm">{initials(m.full_name, m.email)}</div>
                              <div>
                                <div className="td-main">{m.full_name || m.email}</div>
                                <div className="td-sub">{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td><span className={`badge ${m.role === "owner" ? "badge-indigo" : "badge-gray"}`}>{m.role}</span></td>
                          <td><span className={`badge ${m.status === "active" ? "badge-green" : "badge-amber"}`}>{m.status}</span></td>
                          <td className="text-xs color-muted">{m.last_active_at ? new Date(m.last_active_at).toLocaleString() : "—"}</td>
                          <td>
                            {isOwner && m.role !== "owner" ? (
                              <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} disabled={pending} onClick={() => {
                                if (!window.confirm(`Remove ${m.email}?`)) return;
                                run(() => removeMemberAction(m.id));
                              }}>
                                Remove
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(panel === "billing" || panel === "integrations" || panel === "safety") && (
              <div className="settings-panel">
                <div className="card-header"><div className="card-title">{panels.find((p) => p.id === panel)?.label}</div></div>
                <div className="card-body">
                  <p className="form-hint">This section is still the reference UI only. Profile, workspace, members, and blacklist are connected to MongoDB.</p>
                </div>
              </div>
            )}

            {panel === "blacklist" && (
              <div className="settings-panel" id="sBlacklist">
                <div className="card-header">
                  <div className="card-title">Blacklist</div>
                </div>
                <div className="card-body">
                  <form
                    className="form-row"
                    style={{ marginBottom: 16 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => addBlacklistAction(new FormData(e.currentTarget)));
                      e.currentTarget.reset();
                    }}
                  >
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="blType">Type</label>
                      <select id="blType" name="type" className="form-input form-select" defaultValue="domain">
                        <option value="domain">Domain</option>
                        <option value="profile_url">Profile URL</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                      <label className="form-label" htmlFor="blValue">Value</label>
                      <input id="blValue" name="value" className="form-input" placeholder="competitor.com or linkedin.com/in/name" required />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={pending} style={{ alignSelf: "end" }}>Add</button>
                  </form>
                  <div className="form-hint" style={{ marginBottom: 16 }}>
                    Blacklisted domains and profiles are skipped during CSV import and outreach jobs.
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.blacklist.length === 0 ? (
                      <p className="text-xs color-muted">No entries yet.</p>
                    ) : (
                      data.blacklist.map((entry) => (
                        <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                          <span style={{ flex: 1 }}>{entry.value}</span>
                          <span className="text-xs color-muted">{entry.type === "domain" ? "Domain" : "Profile"}</span>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ color: "var(--red)" }} disabled={pending} onClick={() => run(() => removeBlacklistAction(entry.id))}>
                            Remove
                          </button>
                        </div>
                      ))
                    )}
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
