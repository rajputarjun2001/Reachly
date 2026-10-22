"use client";

import { useState } from "react";
import { useModals } from "@/context/modal-context";
import { ModalShell } from "./modal-shell";

export function AppModals() {
  const { isOpen, closeModal } = useModals();
  const [wizardTab, setWizardTab] = useState(0);

  return (
    <>
      <ModalShell
        open={isOpen("newCampaign")}
        onClose={() => closeModal("newCampaign")}
        title="Create New Campaign"
        size="xl"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => closeModal("newCampaign")}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled>
              Next: Lead List → (demo)
            </button>
          </>
        }
      >
        <div className="tabs" id="campaignWizardTabs">
          {["1 · Basics", "2 · Lead List", "3 · Sequence", "4 · Review"].map((label, i) => (
            <button
              key={label}
              type="button"
              className={`tab${wizardTab === i ? " active" : ""}`}
              onClick={() => setWizardTab(i)}
              style={{ background: "none", border: "none", fontFamily: "inherit" }}
            >
              {label}
            </button>
          ))}
        </div>
        {wizardTab === 0 && (
          <div id="cwp1">
            <div className="form-group">
              <label className="form-label" htmlFor="camp-name">Campaign Name</label>
              <input
                id="camp-name"
                className="form-input"
                placeholder="e.g. SaaS Founders - Oct 2026"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="camp-account">LinkedIn Account</label>
              <select id="camp-account" className="form-input form-select">
                <option>Ashish Dhingra (ashish@idesign.market)</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="camp-limit">Daily Limit</label>
                <select id="camp-limit" className="form-input form-select">
                  <option>10 (Recommended)</option>
                  <option>8</option>
                  <option>6</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="camp-tz">Timezone</label>
                <select id="camp-tz" className="form-input form-select">
                  <option>Asia/Kolkata (IST)</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="camp-goal">Campaign Goal (optional)</label>
              <input id="camp-goal" className="form-input" placeholder="e.g. Book product demo calls" />
            </div>
          </div>
        )}
        {wizardTab !== 0 && (
          <p className="form-hint" style={{ marginTop: 8 }}>
            Demo preview: additional wizard steps will be implemented with backend campaign
            configuration in a later milestone.
          </p>
        )}
      </ModalShell>

      <ModalShell
        open={isOpen("addAccount")}
        onClose={() => closeModal("addAccount")}
        title="Connect LinkedIn Account"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => closeModal("addAccount")}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled title="Not implemented in demo">
              Connect (coming soon)
            </button>
          </>
        }
      >
        <div
          style={{
            background: "var(--blue-light)",
            border: "1px solid #BFDBFE",
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 20,
            fontSize: 12.5,
            color: "#1E40AF",
          }}
        >
          <strong>Demo UI only.</strong> Reachly will use authorized LinkedIn connection methods
          (e.g. official APIs or user-guided browser sessions). We do not collect or store LinkedIn
          passwords in this application.
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="li-label">Account label</label>
          <input id="li-label" className="form-input" placeholder="e.g. Ashish — Sales" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="li-limit">Daily Connection Limit</label>
          <select id="li-limit" className="form-input form-select">
            <option>10 (Recommended — safest)</option>
            <option>8</option>
            <option>6</option>
          </select>
          <div className="form-hint">We recommend conservative daily limits aligned with platform policies.</div>
        </div>
      </ModalShell>

      <ModalShell
        open={isOpen("uploadLeads")}
        onClose={() => closeModal("uploadLeads")}
        title="Upload Lead List"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => closeModal("uploadLeads")}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled>
              Upload & Import (demo)
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label" htmlFor="list-name">List Name</label>
          <input id="list-name" className="form-input" placeholder="e.g. SaaS Founders Q4" />
        </div>
        <div className="upload-zone" style={{ marginBottom: 12 }}>
          <div className="upload-icon">📄</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>
            Drop CSV here or click to browse
          </div>
          <div style={{ fontSize: 12, color: "var(--fg2)" }}>
            Required column: <code>linkedin_url</code>. Optional: <code>first_name</code>,{" "}
            <code>last_name</code>, <code>company</code>, <code>title</code>
          </div>
        </div>
        <span style={{ fontSize: 12.5, color: "var(--primary)" }}>📥 Download CSV template (demo)</span>
      </ModalShell>

      <ModalShell
        open={isOpen("leadDetail")}
        onClose={() => closeModal("leadDetail")}
        title="SaaS Founders India · 200 Leads"
        size="lg"
        footer={null}
      >
        <div style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="td-main">Rohan Kapoor</td>
                  <td>ZoomInfo</td>
                  <td>Head of Sales</td>
                  <td><span className="badge badge-blue">Replied</span></td>
                  <td><span style={{ color: "var(--primary)", fontSize: 12 }}>View →</span></td>
                </tr>
                <tr>
                  <td className="td-main">Priya Sharma</td>
                  <td>Notion</td>
                  <td>Product Manager</td>
                  <td><span className="badge badge-green">Accepted</span></td>
                  <td><span style={{ color: "var(--primary)", fontSize: 12 }}>View →</span></td>
                </tr>
                <tr>
                  <td className="td-main">Amit Verma</td>
                  <td>Freshworks</td>
                  <td>Growth Lead</td>
                  <td><span className="badge badge-indigo">Sent</span></td>
                  <td><span style={{ color: "var(--primary)", fontSize: 12 }}>View →</span></td>
                </tr>
                <tr>
                  <td className="td-main">Sneha Nair</td>
                  <td>Meesho</td>
                  <td>CEO</td>
                  <td><span className="badge badge-gray">Pending</span></td>
                  <td><span style={{ color: "var(--primary)", fontSize: 12 }}>View →</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
