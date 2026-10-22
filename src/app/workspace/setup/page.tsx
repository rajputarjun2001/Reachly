import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { SupabaseNotice } from "@/components/auth/supabase-notice";
import { createWorkspaceAction } from "@/app/(auth)/actions";

export default function WorkspaceSetupPage() {
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Give your team a name. You can change this later in Settings."
    >
      <SupabaseNotice />
      <p style={{ fontSize: 12.5, color: "var(--fg2)", marginBottom: 16 }}>
        Demo dashboard data is separate from your workspace until product data features ship.
      </p>
      <AuthForm action={createWorkspaceAction} submitLabel="Continue to dashboard">
        <div className="form-group">
          <label className="form-label" htmlFor="workspaceName">Workspace name</label>
          <input id="workspaceName" name="workspaceName" type="text" className="form-input" placeholder="e.g. iDesign.Market" required />
        </div>
      </AuthForm>
    </AuthShell>
  );
}
