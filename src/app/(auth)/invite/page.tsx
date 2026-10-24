import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { BackendNotice } from "@/components/auth/backend-notice";
import { acceptInviteAction } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ token?: string }> };

export default async function AcceptInvitePage({ searchParams }: Props) {
  const { token } = await searchParams;

  return (
    <AuthShell
      title="Join your team"
      subtitle="Set a password to accept the workspace invitation."
      footer={
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--fg2)", textAlign: "center" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      }
    >
      <BackendNotice />
      <AuthForm action={acceptInviteAction} submitLabel="Accept invite" hiddenFields={{ token: token ?? "" }}>
        <div className="form-group">
          <label className="form-label" htmlFor="displayName">Your name</label>
          <input id="displayName" name="displayName" type="text" className="form-input" autoComplete="name" />
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
