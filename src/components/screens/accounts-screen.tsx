"use client";

import { Dropdown } from "@/components/ui/dropdown";
import { useModals } from "@/context/modal-context";

export function AccountsPopulated() {
  const { openModal } = useModals();
  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">LinkedIn Accounts</div>
          <div className="header-sub">1 active account · 10 connections/day</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("addAccount")}>
          ＋ Add Account
        </button>
      </div>
      <div className="content">
        <div className="safety-banner">
          <div className="safety-banner-icon">🔐</div>
          <div className="safety-banner-text">
            <strong>Demo workspace.</strong> Production will use authorized connection methods and server-side secret management — not password forms in the browser.
          </div>
        </div>
        <div className="grid-2">
          <div className="account-card">
            <Dropdown
              trigger={
                <button type="button" className="dots-btn" style={{ position: "absolute", top: 12, right: 12 }}>
                  •••
                </button>
              }
            >
              <div className="dd-item">⚙️ Settings</div>
              <div className="dd-item">🔄 Reconnect</div>
              <div className="dd-item">📊 View Activity</div>
              <div className="dd-sep" />
              <div className="dd-item danger">🔌 Disconnect</div>
            </Dropdown>
            <div className="account-status-bar">
              <div className="account-info">
                <div className="li-avatar">A</div>
                <div>
                  <div className="account-name">Ashish Dhingra</div>
                  <div className="account-title">Founder & CEO at iDesign.Market</div>
                </div>
              </div>
              <span className="badge badge-green">● Connected</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--fg2)" }}>ashish@idesign.market · Added Oct 8, 2026</div>
            <div>
              <div className="flex-between mb-4"><span className="text-xs color-muted">Daily limit (10 max)</span><span className="text-xs fw-700">10/10</span></div>
              <div className="prog-wrap"><div className="prog-bar" style={{ width: "100%", background: "var(--primary)" }} /></div>
            </div>
            <div className="account-stats">
              <div className="acct-stat"><div className="acct-stat-val">384</div><div className="acct-stat-label">Total Sent</div></div>
              <div className="acct-stat"><div className="acct-stat-val">142</div><div className="acct-stat-label">Accepted</div></div>
              <div className="acct-stat"><div className="acct-stat-val color-green">0</div><div className="acct-stat-label">Warnings</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
              <span className="color-muted">Session status (demo)</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, background: "var(--green)", borderRadius: "50%", display: "inline-block" }} />
                <span className="fw-700 color-green">Healthy</span>
              </div>
            </div>
          </div>
          <div
            className="account-card"
            style={{ border: "2px dashed var(--border)", boxShadow: "none", cursor: "pointer", alignItems: "center", justifyContent: "center", minHeight: 200 }}
            onClick={() => openModal("addAccount")}
            role="button"
            tabIndex={0}
          >
            <div style={{ textAlign: "center", color: "var(--fg2)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>＋</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Add LinkedIn Account</div>
              <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>Each account = 10 more connections/day</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function AccountsEmpty() {
  const { openModal } = useModals();
  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">LinkedIn Accounts</div>
          <div className="header-sub">No accounts connected</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("addAccount")}>＋ Connect Account</button>
      </div>
      <div className="content">
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "40px 0" }}>
          <div className="card">
            <div className="card-body" style={{ textAlign: "center", padding: "40px 32px" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🔗</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Connect your LinkedIn account</div>
              <div style={{ fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.7, marginBottom: 24 }}>
                Use supported LinkedIn connection flows when available, with conservative daily limits aligned with platform policies.
              </div>
              <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={() => openModal("addAccount")}>
                Connect LinkedIn Account →
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
