"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CampaignWithSteps } from "@/lib/campaigns/types";
import type { AccountOption } from "@/lib/accounts/types";
import type { LeadStatus } from "@/lib/leads/types";
import { formatSkipReason } from "@/lib/leads/skip-reason";
import { appRoutes } from "@/lib/routes";
import {
  cancelCampaignAction,
  pauseCampaignAction,
  resumeCampaignAction,
  saveCampaignStepsAction,
  sendConnectionNowAction,
  startCampaignAction,
  updateCampaignAccountAction,
  updateCampaignStatusAction,
} from "@/app/(app)/campaigns/actions";

type CampaignDetailLiveProps = {
  campaign: CampaignWithSteps;
  leadsPreview: {
    id: string;
    name: string;
    company: string | null;
    job_title: string | null;
    status: LeadStatus;
    skip_reason: string | null;
  }[];
  accounts: AccountOption[];
};

function statusLabel(status: CampaignWithSteps["status"]) {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Running";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}

const PAUSE_REASONS: Record<string, string> = {
  manual: "Paused manually.",
  session_expired: "Paused because the LinkedIn session expired. Reconnect the account, then resume.",
  account_flagged: "Paused because LinkedIn asked for verification. Reconnect the account, then resume.",
  account_removed: "Paused because its LinkedIn account was removed.",
};

function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function canSendConnectionNow(status: LeadStatus) {
  return status === "pending" || status === "skipped";
}

function campaignAllowsSendNow(status: CampaignWithSteps["status"]) {
  return status !== "draft" && status !== "archived";
}

export function CampaignDetailLive({ campaign, leadsPreview, accounts }: CampaignDetailLiveProps) {
  const router = useRouter();
  const [steps, setSteps] = useState(campaign.steps);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stats = campaign.stats;
  const counts = campaign.lead_status_counts;
  const pendingLeads = counts.pending ?? 0;
  const canEditSteps = campaign.status === "draft" || campaign.status === "paused";
  const canStart = campaign.status === "draft" && Boolean(campaign.lead_list_id) && Boolean(campaign.linkedin_account_id);
  const canPause = campaign.status === "active";
  const canResume = campaign.status === "paused";
  const canCancel = campaign.status === "active" || campaign.status === "paused";
  const canArchive = campaign.status !== "archived" && campaign.status !== "active";
  const showSendNow = campaignAllowsSendNow(campaign.status);

  const run = (fn: () => Promise<{ error?: string; success?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      setMessage(result.error ?? result.success ?? null);
      if (!result.error) router.refresh();
    });
  };

  const saveSequence = () => {
    const payload = steps.map((s) => ({
      step_order: s.step_order,
      step_type: s.step_type,
      configuration: s.configuration,
    }));
    run(() => saveCampaignStepsAction(campaign.id, JSON.stringify(payload)));
  };

  const funnel = [
    { label: "Connection requests sent", value: stats.connections_sent, of: stats.total_leads },
    { label: "Accepted", value: stats.connections_accepted, of: stats.connections_sent },
    { label: "Follow-ups sent", value: stats.messages_sent, of: null },
    { label: "Replied", value: stats.replied, of: stats.connections_accepted },
  ];

  return (
    <>
      <div className="header">
        <Link href={appRoutes.campaigns} className="btn btn-ghost btn-sm" style={{ marginRight: 4 }}>
          ← Back
        </Link>
        <div>
          <div className="header-title">{campaign.name}</div>
          <div className="header-sub">
            {campaign.lead_count} leads · {campaign.lead_list_name ?? "No list"} ·{" "}
            {campaign.linkedin_account_label ?? "No account"} · {statusLabel(campaign.status)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          {campaign.status === "draft" ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending || !canStart}
              title={canStart ? undefined : "Choose a lead list and a LinkedIn account first"}
              onClick={() => run(() => startCampaignAction(campaign.id))}
            >
              ▶ Start campaign
            </button>
          ) : null}
          {canPause ? (
            <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(() => pauseCampaignAction(campaign.id))}>
              ⏸ Pause
            </button>
          ) : null}
          {canResume ? (
            <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(() => resumeCampaignAction(campaign.id))}>
              ▶ Resume
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Cancel this campaign? Queued sends will stop and it cannot be restarted.")) {
                  run(() => cancelCampaignAction(campaign.id));
                }
              }}
            >
              Cancel
            </button>
          ) : null}
          {canArchive ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => updateCampaignStatusAction(campaign.id, "archived"))}>
              Archive
            </button>
          ) : null}
          <button type="button" className="btn btn-primary btn-sm" onClick={saveSequence} disabled={pending || !canEditSteps}>
            Save sequence
          </button>
        </div>
      </div>
      <div className="content">
        {campaign.status === "paused" && campaign.paused_reason ? (
          <p className="form-hint" style={{ marginBottom: 12, color: "var(--amber)" }}>
            {PAUSE_REASONS[campaign.paused_reason] ?? `Paused: ${campaign.paused_reason}`}
          </p>
        ) : null}
        {message ? (
          <p className="form-hint" style={{ marginBottom: 12 }} role="status">{message}</p>
        ) : null}
        <div className="stats-grid mb-24">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#EEF2FF" }}>📤</div>
            <div className="stat-val">{stats.connections_sent}</div>
            <div className="stat-label">Requests sent</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#ECFDF5" }}>🤝</div>
            <div className="stat-val">{stats.connections_accepted}</div>
            <div className="stat-label">Accepted ({pct(stats.connections_accepted, stats.connections_sent)}%)</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#DBEAFE" }}>💬</div>
            <div className="stat-val">{stats.replied}</div>
            <div className="stat-label">Replies</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#FEF3C7" }}>⏳</div>
            <div className="stat-val">{pendingLeads}</div>
            <div className="stat-label">Leads not contacted</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Setup & funnel</div></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label" htmlFor="detail-account">LinkedIn account</label>
                <select
                  id="detail-account"
                  className="form-input form-select"
                  value={campaign.linkedin_account_id ?? ""}
                  disabled={pending || campaign.status !== "draft"}
                  onChange={(e) => {
                    const value = e.target.value;
                    run(() => updateCampaignAccountAction(campaign.id, value));
                  }}
                >
                  <option value="">Choose an account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}{a.status === "active" ? "" : ` (${a.status})`}
                    </option>
                  ))}
                </select>
                {accounts.length === 0 ? (
                  <div className="form-hint">
                    <Link href={appRoutes.accounts} style={{ color: "var(--primary)" }}>Connect a LinkedIn account</Link> to start this campaign.
                  </div>
                ) : campaign.status !== "draft" ? (
                  <div className="form-hint">The account can only be changed while the campaign is a draft.</div>
                ) : null}
              </div>
              {funnel.map((row) => (
                <div key={row.label} style={{ marginBottom: 12 }}>
                  <div className="flex-between mb-4">
                    <span className="text-xs color-muted">{row.label}</span>
                    <span className="text-xs fw-700">
                      {row.value}
                      {row.of !== null ? ` · ${pct(row.value, row.of)}%` : ""}
                    </span>
                  </div>
                  <div className="prog-wrap">
                    <div
                      className="prog-bar"
                      style={{ width: `${row.of !== null ? pct(row.value, row.of) : 100}%`, background: "var(--primary)", opacity: row.value ? 1 : 0.15 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Message Sequence</div></div>
            <div className="card-body">
              {steps.map((step, i) => (
                <div key={step.id} className="sequence-step">
                  <div className="step-num">{i + 1}</div>
                  <div className="step-body">
                    <div className="step-label">
                      {step.configuration.label ?? step.step_type}
                      {step.step_type === "message" ? ` · ${step.configuration.delay_days ?? 0} day(s) after previous step` : ""}
                    </div>
                    <textarea
                      className="form-input"
                      rows={3}
                      maxLength={step.step_type === "connection_request" ? 280 : undefined}
                      value={step.configuration.body_template ?? ""}
                      disabled={!canEditSteps}
                      onChange={(e) => {
                        const next = [...steps];
                        next[i] = {
                          ...step,
                          configuration: { ...step.configuration, body_template: e.target.value },
                        };
                        setSteps(next);
                      }}
                    />
                  </div>
                </div>
              ))}
              {!canEditSteps ? (
                <p className="form-hint">Pause the campaign to edit its messages.</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Leads from list</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Company</th><th>Title</th><th>Status</th>{showSendNow ? <th>Test</th> : null}</tr>
              </thead>
              <tbody>
                {leadsPreview.length === 0 ? (
                  <tr>
                    <td colSpan={showSendNow ? 5 : 4} className="color-muted text-sm">No leads in the linked list yet.</td>
                  </tr>
                ) : (
                  leadsPreview.map((lead) => (
                    <tr key={lead.id}>
                      <td className="td-main">{lead.name}</td>
                      <td>{lead.company ?? "—"}</td>
                      <td>{lead.job_title ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <span
                            className={
                              lead.status === "skipped" || lead.status === "blacklisted"
                                ? "badge badge-red"
                                : "badge badge-gray"
                            }
                          >
                            {lead.status.replace(/_/g, " ")}
                          </span>
                          {(lead.status === "skipped" || lead.status === "blacklisted") &&
                          formatSkipReason(lead.skip_reason) ? (
                            <span className="text-xs color-muted" title={lead.skip_reason ?? undefined}>
                              {formatSkipReason(lead.skip_reason)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {showSendNow ? (
                        <td>
                          {canSendConnectionNow(lead.status) ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={pending}
                              onClick={() => run(() => sendConnectionNowAction(campaign.id, lead.id))}
                            >
                              Send now
                            </button>
                          ) : (
                            <span className="text-xs color-muted">—</span>
                          )}
                        </td>
                      ) : null}
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
