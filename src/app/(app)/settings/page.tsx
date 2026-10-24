import { SettingsScreen } from "@/components/screens/settings-screen";
import { SettingsLiveView } from "@/components/settings/settings-live-view";
import { isBackendConfigured } from "@/lib/env";
import { loadSettingsData } from "@/lib/settings/repository";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isBackendConfigured()) {
    return <SettingsScreen />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace("/settings");

  let data: Awaited<ReturnType<typeof loadSettingsData>> | null = null;
  let loadError: string | null = null;
  try {
    data = await loadSettingsData();
  } catch {
    loadError = "Could not load settings. Is MongoDB running?";
  }

  if (!data) {
    return <SettingsLiveView data={{
      profile: { id: "", email: workspace.email ?? "", full_name: workspace.fullName, timezone: "UTC", role: workspace.role },
      workspace: {
        id: workspace.workspaceId,
        name: workspace.workspaceName,
        plan: workspace.workspacePlan,
        plan_daily_cap: 10,
        daily_limit_per_account: 10,
        sending_window_start: 8,
        sending_window_end: 20,
        send_on_weekends: false,
        timezone: "UTC",
      },
      members: [],
      blacklist: [],
    }} loadError={loadError} />;
  }

  return <SettingsLiveView data={data} loadError={loadError} />;
}
