"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appRoutes } from "@/lib/routes";

export function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  const next = () => {
    if (step >= 4) {
      router.push(appRoutes.dashboard);
      return;
    }
    setStep((s) => s + 1);
  };

  const prev = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="onboard-overlay" style={{ display: "flex" }}>
      <div className="onboard-progress" id="onboardDots">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`onboard-step-dot${i <= step ? " done" : ""}`} />
        ))}
      </div>
      <div className="onboard-card">
        {step === 1 && (
          <div className="onboard-body" id="ob1">
            <div className="onboard-icon">🚀</div>
            <div className="onboard-title">Welcome to Reachly</div>
            <div className="onboard-sub">
              Your LinkedIn outreach workspace. Connect with your ideal customers using thoughtful sequences and conservative daily limits.
            </div>
            <div className="form-group"><label className="form-label" htmlFor="ob-name">Your full name</label><input id="ob-name" className="form-input" defaultValue="Ashish Dhingra" placeholder="John Smith" /></div>
            <div className="form-group"><label className="form-label" htmlFor="ob-co">Company name</label><input id="ob-co" className="form-input" defaultValue="iDesign.Market" placeholder="Acme Corp" /></div>
          </div>
        )}
        {step === 2 && (
          <div className="onboard-body" id="ob2">
            <div className="onboard-icon">💼</div>
            <div className="onboard-title">Connect LinkedIn Account</div>
            <div className="onboard-sub">
              LinkedIn connections will use authorized, supported methods in production. This demo does not collect passwords.
            </div>
            <div style={{ background: "var(--blue-light)", border: "1px solid #BFDBFE", borderRadius: 8, padding: "12px 14px", fontSize: 12.5, color: "#1E40AF" }}>
              <strong>Coming soon:</strong> OAuth or user-guided session linking. Credentials are never stored in this frontend prototype.
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="onboard-body" id="ob3">
            <div className="onboard-icon">👥</div>
            <div className="onboard-title">Upload Your Lead List</div>
            <div className="onboard-sub">Drop a CSV of LinkedIn profile URLs. We recommend starting with 50–200 leads for your first campaign.</div>
            <div className="upload-zone">
              <div className="upload-icon">📄</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg)", marginBottom: 4 }}>Drop your CSV here</div>
              <div style={{ fontSize: 12, color: "var(--fg2)" }}>or click to browse — needs a <code>linkedin_url</code> column</div>
            </div>
            <div className="form-hint" style={{ marginTop: 10 }}>💡 Not ready? Skip and add leads later in Lead Lists.</div>
          </div>
        )}
        {step === 4 && (
          <div className="onboard-body" id="ob4">
            <div className="onboard-icon">🎯</div>
            <div className="onboard-title">You&apos;re all set!</div>
            <div className="onboard-sub">
              Reachly will target up to <strong>10 connections/day</strong> with randomized timing in the demo — real limits enforced server-side later.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: "var(--bg)", borderRadius: 8, fontSize: 13 }}>✅ <span>LinkedIn connection flow (planned)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: "var(--bg)", borderRadius: 8, fontSize: 13 }}>✅ <span>Daily limit set to 10 connections (recommended)</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: "var(--bg)", borderRadius: 8, fontSize: 13 }}>⏳ <span>Lead list upload pending — add later</span></div>
            </div>
          </div>
        )}
        <div className="onboard-footer">
          <button type="button" className="btn btn-outline btn-sm" onClick={prev} disabled={step === 1}>← Back</button>
          <button type="button" className="btn btn-primary" id="obNextBtn" onClick={next}>
            {step === 4 ? "Go to Dashboard 🚀" : "Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
