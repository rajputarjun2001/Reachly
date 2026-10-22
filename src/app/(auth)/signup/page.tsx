import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SupabaseNotice } from "@/components/auth/supabase-notice";
import { signUpAction } from "@/app/(auth)/actions";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create account"
      subtitle="Start with email and password. You will set up your workspace after signing in."
      footer={
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--fg2)", textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      }
    >
      <SupabaseNotice />
      <AuthForm action={signUpAction} submitLabel="Create account">
        <div className="form-group">
          <label className="form-label" htmlFor="displayName">Your name</label>
          <input id="displayName" name="displayName" type="text" className="form-input" autoComplete="name" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="form-input" autoComplete="email" required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="form-input" autoComplete="new-password" minLength={8} required />
          <div className="form-hint">At least 8 characters</div>
        </div>
      </AuthForm>
    </AuthShell>
  );
}
