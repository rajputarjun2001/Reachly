import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";
import { BackendNotice } from "@/components/auth/backend-notice";
import { createWorkspaceAction } from "@/app/(auth)/actions";

export default function WorkspaceSetupPage() {
  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Give your team a name. You can change this later in Settings."
    >
      <BackendNotice />
      <AuthForm action={createWorkspaceAction} submitLabel="Continue to dashboard">
        <div className="form-group">
          <label className="form-label" htmlFor="workspaceName">Workspace name</label>
          <input id="workspaceName" name="workspaceName" type="text" className="form-input" placeholder="e.g. iDesign.Market" required />
        </div>
      </AuthForm>
    </AuthShell>
  );
}
