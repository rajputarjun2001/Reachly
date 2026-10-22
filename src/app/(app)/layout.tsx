import { AppShell } from "@/components/layout/app-shell";
import { AppProviders } from "@/components/providers/app-providers";
import { DemoEnvironmentBanner } from "@/components/layout/demo-environment-banner";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { demoWorkspace } from "@/data/demo/workspace";

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const workspace = configured ? await getWorkspaceContext() : null;

  const workspaceName = workspace?.workspaceName ?? demoWorkspace.name;
  const workspacePlan = configured
    ? workspace
      ? "Workspace"
      : "Complete setup"
    : demoWorkspace.planLabel;

  return (
    <AppProviders>
      <DemoEnvironmentBanner supabaseConfigured={configured} />
      <AppShell
        workspaceName={workspaceName}
        workspacePlan={workspacePlan}
        workspaceInitials={initialsFromName(workspaceName)}
        showSignOut={configured}
      >
        {children}
      </AppShell>
    </AppProviders>
  );
}
