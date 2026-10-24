import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { BackendNotice } from "@/components/auth/backend-notice";
import { signInAction } from "@/app/(auth)/actions";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

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
      <BackendNotice />
      <AuthForm action={signInAction} submitLabel="Sign in" hiddenFields={next ? { next } : undefined}>
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="form-input" autoComplete="email" required />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="form-input" autoComplete="current-password" required />
        </div>
      </AuthForm>
    </AuthShell>
  );
}
