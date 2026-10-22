import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SupabaseNotice } from "@/components/auth/supabase-notice";
import { resetPasswordAction } from "@/app/(auth)/actions";

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Open this page from the link in your email after requesting a reset."
      footer={
        <p style={{ marginTop: 20, fontSize: 13, textAlign: "center" }}>
          <Link href="/login" style={{ color: "var(--primary)" }}>Back to sign in</Link>
        </p>
      }
    >
      <SupabaseNotice />
      <AuthForm action={resetPasswordAction} submitLabel="Update password">
        <div className="form-group">
          <label className="form-label" htmlFor="password">New password</label>
          <input id="password" name="password" type="password" className="form-input" autoComplete="new-password" minLength={8} required />
        </div>
      </AuthForm>
    </AuthShell>
  );
}
