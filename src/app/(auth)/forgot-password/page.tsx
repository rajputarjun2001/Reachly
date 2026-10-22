import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SupabaseNotice } from "@/components/auth/supabase-notice";
import { forgotPasswordAction } from "@/app/(auth)/actions";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset password"
      subtitle="We will email you a link to choose a new password."
      footer={
        <p style={{ marginTop: 20, fontSize: 13, textAlign: "center" }}>
          <Link href="/login" style={{ color: "var(--primary)" }}>Back to sign in</Link>
        </p>
      }
    >
      <SupabaseNotice />
      <AuthForm action={forgotPasswordAction} submitLabel="Send reset link">
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="form-input" autoComplete="email" required />
        </div>
      </AuthForm>
    </AuthShell>
  );
}
