import { PreviewSwitch } from "@/components/screens/preview-switch";
import { DashboardEmpty, DashboardPopulated } from "@/components/screens/dashboard-screen";
import { DashboardLiveView } from "@/components/dashboard/dashboard-live-view";
import { isBackendConfigured } from "@/lib/env";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";
import { resolveInsightsPageMode } from "@/lib/insights/page-mode";
import { getDashboardInsights, getWorkspaceGreetingName } from "@/lib/insights/repository";
import { emptyOutreachSummary, emptyStatusCounts } from "@/lib/insights/aggregations";
import type { DashboardInsights } from "@/lib/insights/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const mode = resolveInsightsPageMode(isBackendConfigured());

  if (mode === "demo-preview") {
    return <PreviewSwitch populated={<DashboardPopulated />} empty={<DashboardEmpty />} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace("/dashboard");

  let loadError: string | null = null;
  let data: DashboardInsights;
  let greetingName = "there";

  try {
    [data, greetingName] = await Promise.all([getDashboardInsights(), getWorkspaceGreetingName()]);
  } catch (err) {
    console.error("[dashboard]", err);
    loadError = "Could not load dashboard. Please try again.";
    data = {
      total_leads: 0,
      lead_list_count: 0,
      campaign_count: 0,
      campaign_by_status: emptyStatusCounts(),
      recent_campaigns: [],
      leads_added_last_7_days: [],
      outreach: emptyOutreachSummary(),
      outreach_last_7_days: [],
    };
  }

  return <DashboardLiveView data={data} greetingName={greetingName} loadError={loadError} />;
}
