"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DetailActivityChart } from "@/components/charts/detail-activity-chart";
import type { CampaignWithSteps } from "@/lib/campaigns/types";
import { appRoutes } from "@/lib/routes";
import {
  saveCampaignStepsAction,
  updateCampaignStatusAction,
} from "@/app/(app)/campaigns/actions";

type CampaignDetailLiveProps = {
  campaign: CampaignWithSteps;
  leadsPreview: { id: string; name: string; company: string | null; job_title: string | null }[];
};

export function CampaignDetailLive({ campaign, leadsPreview }: CampaignDetailLiveProps) {
  const router = useRouter();
  const [steps, setSteps] = useState(campaign.steps);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const togglePause = () => {
    const next = campaign.status === "paused" ? "active" : "paused";
    startTransition(async () => {
      const result = await updateCampaignStatusAction(campaign.id, next);
      if (!result.error) router.refresh();
    });
  };

  const saveSequence = () => {
    const payload = steps.map((s) => ({
      step_order: s.step_order,
      step_type: s.step_type,
      configuration: s.configuration,
    }));
    startTransition(async () => {
      const result = await saveCampaignStepsAction(campaign.id, JSON.stringify(payload));
      setMessage(result.error ?? result.success ?? null);
      if (!result.error) router.refresh();
    });
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
            {campaign.lead_count} leads · {campaign.lead_list_name ?? "No list"} · {campaign.status}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={togglePause} disabled={pending}>
            {campaign.status === "paused" ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={saveSequence} disabled={pending}>
            Save sequence
          </button>
        </div>
      </div>
      <div className="content">
        <p className="form-hint" style={{ marginBottom: 16 }}>
          Outreach metrics and activity chart are illustrative until sending is implemented. Sequence and lead list are saved to your workspace.
        </p>
        {message && (
          <p className="form-hint" style={{ marginBottom: 12 }} role="status">{message}</p>
        )}
        <div className="stats-grid mb-24">
          <div className="stat-card"><div className="stat-icon" style={{ background: "#EEF2FF" }}>📤</div><div className="stat-val">0</div><div className="stat-label">Requests Sent</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#ECFDF5" }}>🤝</div><div className="stat-val">0</div><div className="stat-label">Accepted</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#FEF3C7" }}>💬</div><div className="stat-val">0</div><div className="stat-label">Replied</div></div>
          <div className="stat-card"><div className="stat-icon" style={{ background: "#F5F3FF" }}>🗓</div><div className="stat-val">0</div><div className="stat-label">Meetings Booked</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div className="card-header"><div className="card-title">Activity (demo chart)</div></div>
            <div className="card-body"><DetailActivityChart /></div>
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
                <tr><th>Name</th><th>Company</th><th>Title</th><th>Status</th></tr>
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
                      <td><span className="badge badge-gray">Not enrolled</span></td>
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
