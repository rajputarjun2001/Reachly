"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dropdown } from "@/components/ui/dropdown";
import { useModals } from "@/context/modal-context";
import type { AccountStatus, LinkedInAccountView } from "@/lib/accounts/types";
import {
  checkAccountAction,
  reconnectAccountAction,
  removeAccountAction,
  updateAccountAction,
} from "@/app/(app)/accounts/actions";
import { RefreshSessionModal } from "@/components/accounts/refresh-session-modal";

type AccountsLiveViewProps = {
  accounts: LinkedInAccountView[];
  dailyCap: number;
  loadError: string | null;
};

const STATUS_BADGE: Record<AccountStatus, { className: string; label: string }> = {
  active: { className: "badge badge-green", label: "● Connected" },
  connecting: { className: "badge badge-amber", label: "Connecting…" },
  disconnected: { className: "badge badge-gray", label: "Disconnected" },
  flagged: { className: "badge badge-red", label: "Needs verification" },
};

function formatDate(value: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function AccountCard({ account, dailyCap }: { account: LinkedInAccountView; dailyCap: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [refreshSessionOpen, setRefreshSessionOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const badge = STATUS_BADGE[account.status];
  const used = Math.min(100, Math.round((account.today_sent_count / Math.max(1, account.daily_limit)) * 100));

  const run = (fn: () => Promise<{ error?: string; success?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      setMessage(result.error ?? result.success ?? null);
      router.refresh();
    });
  };

  const reconnect = () => {
    const password = window.prompt(
      "Re-enter the LinkedIn password, or leave blank to reuse the stored one.",
      "",
    );
    if (password === null) return;
    run(() => reconnectAccountAction(account.id, { password: password || undefined }));
  };

  const openSessionRefresh = () => setRefreshSessionOpen(true);

  const check = () => {
    startTransition(async () => {
      const result = await checkAccountAction(account.id);
      if (result.error) setMessage(result.error);
      else if (result.health) {
        setMessage(result.health.valid ? "Session is valid." : "Session expired — reconnect the account.");
      }
      router.refresh();
    });
  };

  const remove = () => {
    if (!window.confirm(`Remove ${account.display_name}? Campaigns using it will be paused.`)) return;
    run(() => removeAccountAction(account.id));
  };

  return (
    <div className="account-card">
      <Dropdown
        trigger={
          <button type="button" className="dots-btn" style={{ position: "absolute", top: 12, right: 12 }} disabled={pending}>
            •••
          </button>
        }
      >
        <div className="dd-item" role="button" tabIndex={0} onClick={() => setEditing(true)}>⚙️ Settings</div>
        <div className="dd-item" role="button" tabIndex={0} onClick={reconnect}>🔄 Reconnect (password)</div>
        <div className="dd-item" role="button" tabIndex={0} onClick={openSessionRefresh}>🍪 Update session cookies</div>
        <div className="dd-item" role="button" tabIndex={0} onClick={check}>🩺 Check session</div>
        <div className="dd-sep" />
        <div className="dd-item danger" role="button" tabIndex={0} onClick={remove}>🔌 Remove</div>
      </Dropdown>
      <div className="account-status-bar">
        <div className="account-info">
          <div className="li-avatar">{account.display_name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="account-name">{account.full_name ?? account.display_name}</div>
            <div className="account-title">{account.headline ?? account.label ?? "LinkedIn member"}</div>
          </div>
        </div>
        <span className={badge.className}>{badge.label}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--fg2)" }}>
        {account.linkedin_email} · Added {new Date(account.created_at).toLocaleDateString()}
      </div>
      {account.flag_reason ? (
        <p className="form-hint" style={{ color: "var(--red)" }}>
          LinkedIn asked for verification. Paste fresh session cookies or reconnect with your password.
        </p>
      ) : null}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            run(async () => {
              const result = await updateAccountAction(account.id, formData);
              if (!result.error) setEditing(false);
              return result;
            });
          }}
        >
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor={`label-${account.id}`}>Label</label>
              <input id={`label-${account.id}`} name="label" className="form-input" defaultValue={account.label ?? ""} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor={`limit-${account.id}`}>Daily limit (max {dailyCap})</label>
              <input
                id={`limit-${account.id}`}
                name="daily_limit"
                type="number"
                min={1}
                max={dailyCap}
                className="form-input"
                defaultValue={account.daily_limit}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>Save</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(false)} disabled={pending}>Cancel</button>
          </div>
        </form>
      ) : (
        <div>
          <div className="flex-between mb-4">
            <span className="text-xs color-muted">Sent today (limit {account.daily_limit})</span>
            <span className="text-xs fw-700">{account.today_sent_count}/{account.daily_limit}</span>
          </div>
          <div className="prog-wrap"><div className="prog-bar" style={{ width: `${used}%`, background: "var(--primary)" }} /></div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
        <span className="color-muted">Last checked</span>
        <span className="fw-700">{formatDate(account.last_health_check)}</span>
      </div>
      {message ? <p className="form-hint" role="status">{message}</p> : null}
      {pending ? <p className="form-hint">Working… LinkedIn actions can take up to a minute.</p> : null}
      <RefreshSessionModal
        open={refreshSessionOpen}
        accountId={account.id}
        accountName={account.display_name}
        onClose={() => setRefreshSessionOpen(false)}
      />
    </div>
  );
}

export function AccountsLiveView({ accounts, dailyCap, loadError }: AccountsLiveViewProps) {
  const { openModal } = useModals();
  const active = accounts.filter((a) => a.status === "active");
  const capacity = active.reduce((sum, a) => sum + a.daily_limit, 0);

  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">LinkedIn Accounts</div>
          <div className="header-sub">
            {accounts.length === 0
              ? "No accounts connected"
              : `${active.length} active account${active.length === 1 ? "" : "s"} · ${capacity} connections/day`}
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("addAccount")}>
          ＋ Add Account
        </button>
      </div>
      <div className="content">
        {loadError ? (
          <p role="alert" style={{ color: "#B91C1C", marginBottom: 16 }}>{loadError}</p>
        ) : null}
        <div className="safety-banner">
          <div className="safety-banner-icon">🔐</div>
          <div className="safety-banner-text">
            <strong>Credentials are encrypted at rest.</strong> Sessions run in an isolated browser and sends stay inside
            your workspace sending window and daily limits.
          </div>
        </div>
        <div className="grid-2">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} dailyCap={dailyCap} />
          ))}
          <div
            className="account-card"
            style={{ border: "2px dashed var(--border)", boxShadow: "none", cursor: "pointer", alignItems: "center", justifyContent: "center", minHeight: 200 }}
            onClick={() => openModal("addAccount")}
            onKeyDown={(e) => {
              if (e.key === "Enter") openModal("addAccount");
            }}
            role="button"
            tabIndex={0}
          >
            <div style={{ textAlign: "center", color: "var(--fg2)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>＋</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Add LinkedIn Account</div>
              <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>Each account adds up to {dailyCap} connections/day</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
