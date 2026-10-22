"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modals/modal-shell";
import { DEFAULT_CAMPAIGN_STEPS } from "@/lib/campaigns/constants";
import type { CampaignStepConfiguration } from "@/lib/campaigns/types";
import {
  createCampaignAction,
  getLeadListsForCampaignAction,
} from "@/app/(app)/campaigns/actions";
import { appRoutes } from "@/lib/routes";

type LeadListOption = { id: string; name: string; lead_count: number };

type WizardStep = {
  step_order: number;
  step_type: string;
  configuration: CampaignStepConfiguration;
};

type CampaignWizardModalProps = {
  open: boolean;
  onClose: () => void;
  liveMode: boolean;
};

export function CampaignWizardModal({ open, onClose, liveMode }: CampaignWizardModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [dailyLimit, setDailyLimit] = useState("10");
  const [timezone, setTimezone] = useState("Asia/Kolkata (IST)");
  const [leadListId, setLeadListId] = useState("");
  const [leadLists, setLeadLists] = useState<LeadListOption[]>([]);
  const [steps, setSteps] = useState<WizardStep[]>(DEFAULT_CAMPAIGN_STEPS);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      setTab(0);
      setName("");
      setGoal("");
      setMessage(null);
      setSteps(DEFAULT_CAMPAIGN_STEPS);
      setLeadListId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !liveMode) return;
    startTransition(async () => {
      const result = await getLeadListsForCampaignAction();
      if (result.lists) setLeadLists(result.lists);
    });
  }, [open, liveMode]);

  const onCreate = () => {
    if (!liveMode) return;
    if (!name.trim()) {
      setMessage("Campaign name is required.");
      return;
    }
    if (!leadListId) {
      setMessage("Select a lead list for this campaign.");
      return;
    }
    const formData = new FormData();
    formData.set("name", name);
    formData.set("lead_list_id", leadListId);
    formData.set("goal", goal);
    formData.set("daily_limit", dailyLimit);
    formData.set("timezone", timezone.split(" ")[0]);
    formData.set("steps_json", JSON.stringify(steps));
    startTransition(async () => {
      const result = await createCampaignAction(formData);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      onClose();
      if (result.campaignId) {
        router.push(appRoutes.campaignDetail(result.campaignId));
      } else {
        router.refresh();
      }
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Create New Campaign"
      size="xl"
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          {tab < 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!liveMode || pending}
              onClick={() => setTab((t) => Math.min(3, t + 1))}
            >
              {tab === 0 ? "Next: Lead List →" : tab === 1 ? "Next: Sequence →" : "Next: Review →"}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!liveMode || pending}
              onClick={onCreate}
            >
              {pending ? "Saving…" : "Create draft"}
            </button>
          )}
        </>
      }
    >
      {!liveMode && (
        <p className="form-hint" style={{ marginBottom: 12 }}>
          Demo preview — configure Supabase and sign in to create real campaigns.
        </p>
      )}
      <div className="tabs" id="campaignWizardTabs">
        {["1 · Basics", "2 · Lead List", "3 · Sequence", "4 · Review"].map((label, i) => (
          <button
            key={label}
            type="button"
            className={`tab${tab === i ? " active" : ""}`}
            onClick={() => setTab(i)}
            style={{ background: "none", border: "none", fontFamily: "inherit" }}
          >
            {label}
          </button>
        ))}
      </div>
      {message && (
        <p className="form-hint" style={{ color: "var(--red)", marginTop: 8 }} role="alert">
          {message}
        </p>
      )}
      {tab === 0 && (
        <div id="cwp1">
          <div className="form-group">
            <label className="form-label" htmlFor="camp-name">Campaign Name</label>
            <input
              id="camp-name"
              className="form-input"
              placeholder="e.g. SaaS Founders - Oct 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!liveMode}
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="camp-account">LinkedIn Account</label>
            <select id="camp-account" className="form-input form-select" disabled>
              <option>Not connected — integration coming soon</option>
            </select>
            <div className="form-hint">Account linking is not available in this release.</div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="camp-limit">Daily Limit (saved)</label>
              <select
                id="camp-limit"
                className="form-input form-select"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                disabled={!liveMode}
              >
                <option value="10">10 (Recommended)</option>
                <option value="8">8</option>
                <option value="6">6</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="camp-tz">Timezone (saved)</label>
              <select
                id="camp-tz"
                className="form-input form-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!liveMode}
              >
                <option>Asia/Kolkata (IST)</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="camp-goal">Campaign Goal (optional)</label>
            <input
              id="camp-goal"
              className="form-input"
              placeholder="e.g. Book product demo calls"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={!liveMode}
            />
          </div>
        </div>
      )}
      {tab === 1 && (
        <div className="form-group">
          <label className="form-label" htmlFor="camp-lead-list">Lead list</label>
          {leadLists.length === 0 ? (
            <p className="form-hint">No lead lists yet. Upload a CSV on the Lead Lists page first.</p>
          ) : (
            <select
              id="camp-lead-list"
              className="form-input form-select"
              value={leadListId}
              onChange={(e) => setLeadListId(e.target.value)}
              disabled={!liveMode}
            >
              <option value="">Select a list…</option>
              {leadLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.lead_count} leads)
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {tab === 2 && (
        <div>
          <p className="form-hint" style={{ marginBottom: 12 }}>
            Configure message templates. Sending is not enabled yet — this saves your sequence only.
          </p>
          {steps.map((step, idx) => (
            <div key={step.step_order} className="form-group">
              <label className="form-label">{step.configuration.label ?? `Step ${step.step_order}`}</label>
              <textarea
                className="form-input"
                rows={3}
                value={step.configuration.body_template ?? ""}
                onChange={(e) => {
                  const next = [...steps];
                  next[idx] = {
                    ...step,
                    configuration: { ...step.configuration, body_template: e.target.value },
                  };
                  setSteps(next);
                }}
                disabled={!liveMode}
              />
            </div>
          ))}
        </div>
      )}
      {tab === 3 && (
        <div className="form-hint">
          <p><strong>{name || "Untitled campaign"}</strong> · draft</p>
          <p>Lead list: {leadLists.find((l) => l.id === leadListId)?.name ?? "—"}</p>
          <p>{steps.length} sequence steps · daily limit {dailyLimit}</p>
          <p style={{ marginTop: 8 }}>Status stays <strong>draft</strong> until you activate it (no messages will be sent automatically).</p>
        </div>
      )}
    </ModalShell>
  );
}
