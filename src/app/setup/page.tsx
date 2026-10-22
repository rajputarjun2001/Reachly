import Link from "next/link";
import { getSupabaseConfigError, isSupabaseConfigured } from "@/lib/env";

export default function SetupPage() {
  const configured = isSupabaseConfigured();
  const configError = getSupabaseConfigError();

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
              {configured ? "Supabase environment variables detected" : "Supabase not configured"}
            </strong>
          </p>
          {!configured && configError ? (
            <p role="alert" style={{ color: "var(--fg2)", marginBottom: 16 }}>{configError}</p>
          ) : null}
          <p style={{ marginBottom: 12 }}>
            See <code>docs/SETUP.md</code> in the repository for Supabase project creation, migrations, and local
            development.
          </p>
          <ul style={{ paddingLeft: 20, color: "var(--fg2)", marginBottom: 20 }}>
            <li>Copy <code>.env.example</code> to <code>.env.local</code></li>
            <li>Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></li>
            <li>Run migrations with the Supabase CLI</li>
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
