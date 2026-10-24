"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modals/modal-shell";
import { DEFAULT_CAMPAIGN_STEPS, MAX_CAMPAIGN_STEPS } from "@/lib/campaigns/constants";
import type { CampaignStepConfiguration, CampaignStepType } from "@/lib/campaigns/types";
import type { AccountOption } from "@/lib/accounts/types";
import {
  createCampaignAction,
  getAccountsForCampaignAction,
  getLeadListsForCampaignAction,
} from "@/app/(app)/campaigns/actions";
import { appRoutes } from "@/lib/routes";

type LeadListOption = { id: string; name: string; lead_count: number };

type WizardStep = {
  step_order: number;
  step_type: CampaignStepType;
  configuration: CampaignStepConfiguration;
};

type CampaignWizardModalProps = {
  open: boolean;
  onClose: () => void;
  liveMode: boolean;
};

const TIMEZONES = [
  { value: "", label: "Workspace default" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST)" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "UTC", label: "UTC" },
];

export function CampaignWizardModal({ open, onClose, liveMode }: CampaignWizardModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [dailyLimit, setDailyLimit] = useState("10");
  const [timezone, setTimezone] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
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
      setAccountId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !liveMode) return;
    startTransition(async () => {
      const [listsResult, accountsResult] = await Promise.all([
        getLeadListsForCampaignAction(),
        getAccountsForCampaignAction(),
      ]);
      if (listsResult.lists) setLeadLists(listsResult.lists);
      if (accountsResult.accounts) {
        setAccounts(accountsResult.accounts);
        const firstActive = accountsResult.accounts.find((a) => a.status === "active");
        if (firstActive) setAccountId((current) => current || firstActive.id);
      }
    });
  }, [open, liveMode]);

  const updateStep = (idx: number, patch: Partial<CampaignStepConfiguration>) => {
    setSteps((current) => {
      const next = [...current];
      next[idx] = { ...next[idx], configuration: { ...next[idx].configuration, ...patch } };
      return next;
    });
  };

  const addMessage = () => {
    setSteps((current) => [
      ...current,
      {
        step_order: current.length + 1,
        step_type: "message",
        configuration: { label: `Follow-up ${current.length}`, body_template: "", delay_days: 3 },
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((current) =>
      current.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })),
    );
  };

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
    formData.set("linkedin_account_id", accountId);
    formData.set("goal", goal);
    formData.set("daily_limit", dailyLimit);
    formData.set("timezone", timezone);
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

  const selectedAccount = accounts.find((a) => a.id === accountId);

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
          Demo preview — configure the backend and sign in to create real campaigns.
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
            {liveMode && accounts.length > 0 ? (
              <select
                id="camp-account"
                className="form-input form-select"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Choose later…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}{a.status === "active" ? "" : ` (${a.status})`}
                  </option>
                ))}
              </select>
            ) : (
              <select id="camp-account" className="form-input form-select" disabled>
                <option>No accounts connected</option>
              </select>
            )}
            <div className="form-hint">
              {liveMode && accounts.length === 0
                ? "Connect an account on the LinkedIn Accounts page before launching. You can still save a draft."
                : "Requests are sent from this account; it must be connected when you start the campaign."}
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="camp-limit">Daily Limit</label>
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
              <label className="form-label" htmlFor="camp-tz">Timezone</label>
              <select
                id="camp-tz"
                className="form-input form-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={!liveMode}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
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
            Step 1 is the connection request (note optional, max 280 characters). Follow-ups are sent after the
            lead accepts, each waiting the given number of days. Variables: <code>{"{{first_name}}"}</code>,{" "}
            <code>{"{{last_name}}"}</code>, <code>{"{{company}}"}</code>, <code>{"{{job_title}}"}</code>.
          </p>
          {steps.map((step, idx) => (
            <div key={step.step_order} className="form-group">
              <div className="flex-between">
                <label className="form-label">{step.configuration.label ?? `Step ${step.step_order}`}</label>
                {step.step_type === "message" ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="text-xs color-muted">Wait</span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      className="form-input"
                      style={{ width: 70 }}
                      aria-label={`Delay days for step ${step.step_order}`}
                      value={step.configuration.delay_days ?? 0}
                      onChange={(e) => updateStep(idx, { delay_days: Number(e.target.value) })}
                      disabled={!liveMode}
                    />
                    <span className="text-xs color-muted">days</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeStep(idx)} disabled={!liveMode}>
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
              <textarea
                className="form-input"
                rows={3}
                maxLength={step.step_type === "connection_request" ? 280 : undefined}
                value={step.configuration.body_template ?? ""}
                onChange={(e) => updateStep(idx, { body_template: e.target.value })}
                disabled={!liveMode}
              />
            </div>
          ))}
          {steps.length < MAX_CAMPAIGN_STEPS ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={addMessage} disabled={!liveMode}>
              ＋ Add follow-up
            </button>
          ) : null}
        </div>
      )}
      {tab === 3 && (
        <div className="form-hint">
          <p><strong>{name || "Untitled campaign"}</strong> · draft</p>
          <p>LinkedIn account: {selectedAccount?.label ?? "not selected"}</p>
          <p>Lead list: {leadLists.find((l) => l.id === leadListId)?.name ?? "—"}</p>
          <p>{steps.length} sequence steps · daily limit {dailyLimit}</p>
          <p style={{ marginTop: 8 }}>
            The campaign stays a <strong>draft</strong> until you press Start on its detail page.
          </p>
        </div>
      )}
    </ModalShell>
  );
}
