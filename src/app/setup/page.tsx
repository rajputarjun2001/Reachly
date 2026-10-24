import Link from "next/link";
import { getBackendConfigError, isBackendConfigured } from "@/lib/env";

export default function SetupPage() {
  const configured = isBackendConfigured();
  const configError = getBackendConfigError();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 40 }}>
      <div className="card" style={{ maxWidth: 720, margin: "0 auto" }}>
        <div className="card-header">
          <div className="card-title">Reachly setup</div>
        </div>
        <div className="card-body" style={{ fontSize: 14, lineHeight: 1.6 }}>
          <p style={{ marginBottom: 16 }}>
            Status:{" "}
            <strong style={{ color: configured ? "var(--green)" : "var(--amber)" }}>
              {configured ? "Backend environment variables detected" : "Backend not configured"}
            </strong>
          </p>
          {!configured && configError ? (
            <p role="alert" style={{ color: "var(--fg2)", marginBottom: 16 }}>{configError}</p>
          ) : null}
          <p style={{ marginBottom: 12 }}>
            See <code>docs/SETUP.md</code> in the repository for local development.
          </p>
          <ul style={{ paddingLeft: 20, color: "var(--fg2)", marginBottom: 20 }}>
            <li>Copy <code>.env.example</code> to <code>.env</code> and fill in <code>JWT_SECRET</code> and <code>ENCRYPTION_KEY</code></li>
            <li>Start MongoDB and Redis with <code>npm run services:up</code></li>
            <li>Install the browser once with <code>npm run browsers:install</code></li>
            <li>Restart <code>npm run dev</code></li>
          </ul>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/login" className="btn btn-primary">Go to sign in</Link>
            {configured ? (
              <Link href="/dashboard" className="btn btn-outline">Dashboard</Link>
            ) : (
              <span className="btn btn-outline" style={{ opacity: 0.5, pointerEvents: "none" }}>
                Dashboard (requires auth when configured)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
