"use client";

import { Dropdown } from "@/components/ui/dropdown";
import { useModals } from "@/context/modal-context";

export function LeadsPopulated() {
  const { openModal } = useModals();
  return (
    <>
      <p className="form-hint" style={{ padding: "8px 24px 0", margin: 0 }}>
        Demo preview — sample data is not stored. Configure Supabase and sign in for real lead lists.
      </p>
      <div className="header">
        <div>
          <div className="header-title">Lead Lists</div>
          <div className="header-sub">4 lists · 930 total leads (demo)</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("uploadLeads")}>
          ＋ Upload CSV
        </button>
      </div>
      <div className="content">
        <div className="grid-3 mb-24">
          <div className="card" style={{ cursor: "pointer" }} onClick={() => openModal("leadDetail")} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openModal("leadDetail")}>
            <div className="card-body">
              <div className="flex-between mb-16">
                <div style={{ fontSize: 18 }}>👥</div>
                <Dropdown trigger={<button type="button" className="dots-btn" onClick={(e) => e.stopPropagation()}>•••</button>}>
                  <div className="dd-item">📥 Download CSV</div>
                  <div className="dd-item">✏️ Rename</div>
                  <div className="dd-sep" />
                  <div className="dd-item danger">🗑 Delete List</div>
                </Dropdown>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>SaaS Founders India</div>
              <div className="text-xs color-muted mb-16">Uploaded Oct 8 · 200 leads</div>
              <div className="flex-between text-xs">
                <div><span className="color-green fw-700">52</span> <span className="color-muted">connected</span></div>
                <div><span className="color-amber fw-700">144</span> <span className="color-muted">pending</span></div>
                <div><span className="color-primary fw-700">4</span> <span className="color-muted">replied</span></div>
              </div>
            </div>
          </div>
          <div className="card" style={{ cursor: "pointer" }}>
            <div className="card-body">
              <div className="flex-between mb-16">
                <div style={{ fontSize: 18 }}>🏗️</div>
                <Dropdown trigger={<button type="button" className="dots-btn">•••</button>}>
                  <div className="dd-item">📥 Download CSV</div>
                  <div className="dd-item">✏️ Rename</div>
                  <div className="dd-sep" />
                  <div className="dd-item danger">🗑 Delete List</div>
                </Dropdown>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>AEC Decision Makers</div>
              <div className="text-xs color-muted mb-16">Uploaded Oct 12 · 350 leads</div>
              <div className="flex-between text-xs">
                <div><span className="color-green fw-700">61</span> <span className="color-muted">connected</span></div>
                <div><span className="color-amber fw-700">157</span> <span className="color-muted">pending</span></div>
                <div><span className="color-primary fw-700">3</span> <span className="color-muted">replied</span></div>
              </div>
            </div>
          </div>
          <div className="card" style={{ border: "2px dashed var(--border)", boxShadow: "none", cursor: "pointer" }} onClick={() => openModal("uploadLeads")} role="button" tabIndex={0}>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 130, gap: 8 }}>
              <div style={{ fontSize: 30 }}>📤</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg2)" }}>Upload New List</div>
              <div style={{ fontSize: 11.5, color: "var(--fg3)" }}>CSV with linkedin_url column</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function LeadsEmpty() {
  const { openModal } = useModals();
  return (
    <>
      <div className="header">
        <div>
          <div className="header-title">Lead Lists</div>
          <div className="header-sub">No lists uploaded yet</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openModal("uploadLeads")}>＋ Upload CSV</button>
      </div>
      <div className="content">
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
          <div className="card">
            <div className="card-body">
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Upload your first lead list</div>
                <div style={{ fontSize: 13, color: "var(--fg2)" }}>A CSV with LinkedIn profile URLs. That&apos;s all Reachly needs to start reaching out.</div>
              </div>
              <div className="upload-zone" onClick={() => openModal("uploadLeads")} role="button" tabIndex={0}>
                <div className="upload-icon">📤</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 6 }}>Drop your CSV here or click to browse</div>
                <div style={{ fontSize: 12, color: "var(--fg2)" }}>Required column: <code>linkedin_url</code> — everything else is optional</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
