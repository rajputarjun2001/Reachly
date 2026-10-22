"use client";

import { useModals } from "@/context/modal-context";
import { CampaignWizardModal } from "@/components/campaigns/campaign-wizard-modal";
import { ModalShell } from "./modal-shell";

type AppModalsProps = {
  supabaseConfigured?: boolean;
};

export function AppModals({ supabaseConfigured = false }: AppModalsProps) {
  const { isOpen, closeModal } = useModals();

  return (
    <>
      <CampaignWizardModal
        open={isOpen("newCampaign")}
        onClose={() => closeModal("newCampaign")}
        liveMode={supabaseConfigured}
      />

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
        title="Upload Lead List (demo preview)"
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
        <p className="form-hint" style={{ marginBottom: 12 }}>
          Demo UI only — not saved. Sign in with Supabase configured to import real lead lists on the Leads page.
        </p>
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
