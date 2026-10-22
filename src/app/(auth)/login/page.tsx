import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SupabaseNotice } from "@/components/auth/supabase-notice";
import { signInAction } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ next?: string; reset?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, reset } = await searchParams;

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your Reachly workspace. LinkedIn connection is configured separately after sign-in."
      footer={
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--fg2)", textAlign: "center" }}>
          No account?{" "}
          <Link href="/signup" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Create one
          </Link>
        </p>
      }
    >
      <SupabaseNotice />
      {reset === "success" ? (
        <p role="status" style={{ fontSize: 13, color: "var(--green)", marginBottom: 16 }}>
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      <AuthForm action={signInAction} submitLabel="Sign in" hiddenFields={next ? { next } : undefined}>
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="form-input" autoComplete="email" required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="form-input" autoComplete="current-password" required />
        </div>
        <p style={{ fontSize: 12.5, marginBottom: 8 }}>
          <Link href="/forgot-password" style={{ color: "var(--primary)" }}>Forgot password?</Link>
        </p>
      </AuthForm>
    </AuthShell>
  );
}
