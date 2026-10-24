"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DetailActivityChart } from "@/components/charts/detail-activity-chart";
import type { CampaignWithSteps } from "@/lib/campaigns/types";
import type { CampaignExecutionStats } from "@/lib/campaigns/execution/types";
import { appRoutes } from "@/lib/routes";
import {
  cancelCampaignExecutionAction,
  pauseCampaignExecutionAction,
  processDueCampaignJobsAction,
  resumeCampaignExecutionAction,
  saveCampaignStepsAction,
  startCampaignExecutionAction,
} from "@/app/(app)/campaigns/actions";

type CampaignDetailLiveProps = {
  campaign: CampaignWithSteps;
  leadsPreview: { id: string; name: string; company: string | null; job_title: string | null }[];
  executionStats: CampaignExecutionStats | null;
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

export function CampaignDetailLive({ campaign, leadsPreview, executionStats }: CampaignDetailLiveProps) {
  const router = useRouter();
  const [steps, setSteps] = useState(campaign.steps);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stats = executionStats;
  const canEditSteps = campaign.status === "draft" || campaign.status === "paused";
  const canStart = campaign.status === "draft" && campaign.lead_list_id && campaign.steps.length > 0;
  const canPause = campaign.status === "active";
  const canResume = campaign.status === "paused";
  const canCancel = campaign.status === "active" || campaign.status === "paused" || campaign.status === "draft";

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

  return (
    <>
      <div className="header">
        <Link href={appRoutes.campaigns} className="btn btn-ghost btn-sm" style={{ marginRight: 4 }}>
          ← Back
        </Link>
        <div>
          <div className="header-title">{campaign.name}</div>
          <div className="header-sub">
            {campaign.lead_count} leads in list · {campaign.lead_list_name ?? "No list"} · {statusLabel(campaign.status)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          {canStart ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => startCampaignExecutionAction(campaign.id))}>
              Start campaign
            </button>
          ) : null}
          {canPause ? (
            <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(() => pauseCampaignExecutionAction(campaign.id))}>
              ⏸ Pause
            </button>
          ) : null}
          {canResume ? (
            <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(() => resumeCampaignExecutionAction(campaign.id))}>
              ▶ Resume
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" className="btn btn-outline btn-sm" disabled={pending} onClick={() => run(() => cancelCampaignExecutionAction(campaign.id))}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={pending || campaign.status !== "active"}
            title="Runs due jobs with the disabled executor (records blocked status — no LinkedIn send)"
            onClick={() => run(() => processDueCampaignJobsAction(campaign.id))}
          >
            Process due jobs
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveSequence} disabled={pending || !canEditSteps}>
            Save sequence
          </button>
        </div>
      </div>
      <div className="content">
        <p className="form-hint" style={{ marginBottom: 16 }}>
          Execution engine is active in your workspace database. <strong>LinkedIn delivery is not configured</strong> — jobs run through a disabled executor and are marked blocked/unsupported, not sent.
        </p>
        {message ? (
          <p className="form-hint" style={{ marginBottom: 12 }} role="status">{message}</p>
        ) : null}
        <div className="stats-grid mb-24">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#EEF2FF" }}>👥</div>
            <div className="stat-val">{stats?.enrolled ?? 0}</div>
            <div className="stat-label">Enrolled</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#FEF3C7" }}>⏳</div>
            <div className="stat-val">{stats?.pending_jobs ?? 0}</div>
            <div className="stat-label">Pending jobs</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#ECFDF5" }}>✓</div>
            <div className="stat-val">{stats?.completed_enrollments ?? 0}</div>
            <div className="stat-label">Completed enrollments</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: "#FEE2E2" }}>!</div>
            <div className="stat-val">{stats?.failed_enrollments ?? 0}</div>
            <div className="stat-label">Failed enrollments</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Activity (illustrative)</div></div>
            <div className="card-body">
              <p className="text-xs color-muted" style={{ marginBottom: 8 }}>Chart is not tied to execution data yet.</p>
              <DetailActivityChart />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Message Sequence</div></div>
            <div className="card-body">
              {steps.length === 0 ? (
                <p className="color-muted text-sm">No steps configured.</p>
              ) : (
                steps.map((step, i) => (
                  <div key={step.id} className="sequence-step">
                    <div className="step-num">{i + 1}</div>
                    <div className="step-body">
                      <div className="step-label">{step.configuration.label ?? step.step_type}</div>
                      <textarea
                        className="form-input"
                        rows={3}
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
                ))
              )}
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
                <tr><th>Name</th><th>Company</th><th>Title</th><th>Enrollment</th></tr>
              </thead>
              <tbody>
                {leadsPreview.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="color-muted text-sm">No leads in the linked list yet.</td>
                  </tr>
                ) : (
                  leadsPreview.map((lead) => (
                    <tr key={lead.id}>
                      <td className="td-main">{lead.name}</td>
                      <td>{lead.company ?? "—"}</td>
                      <td>{lead.job_title ?? "—"}</td>
                      <td>
                        <span className="badge badge-gray">
                          {(stats?.enrolled ?? 0) > 0 ? "See execution stats" : "Not enrolled until start"}
                        </span>
                      </td>
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
