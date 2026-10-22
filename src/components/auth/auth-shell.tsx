import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 420 }}>
        <div className="card-body" style={{ padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div className="logo-mark">R</div>
            <div className="logo-name">
              Reach<span>ly</span>
            </div>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{title}</h1>
          {subtitle ? (
            <p style={{ fontSize: 14, color: "var(--fg2)", marginBottom: 24, lineHeight: 1.5 }}>
              {subtitle}
            </p>
          ) : null}
          {children}
          {footer}
        </div>
      </div>
      <p style={{ position: "fixed", bottom: 16, fontSize: 12, color: "var(--fg3)" }}>
        <Link href="/setup" style={{ color: "var(--primary)" }}>Setup &amp; configuration</Link>
      </p>
    </div>
  );
}
