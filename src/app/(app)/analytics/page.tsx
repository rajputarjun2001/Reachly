import { PreviewSwitch } from "@/components/screens/preview-switch";
import { AnalyticsEmpty, AnalyticsPopulated } from "@/components/screens/analytics-screen";
import { AnalyticsLiveView } from "@/components/analytics/analytics-live-view";
import { isBackendConfigured } from "@/lib/env";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";
import { resolveInsightsPageMode } from "@/lib/insights/page-mode";
import { getAnalyticsInsights } from "@/lib/insights/repository";
import { emptyOutreachSummary, emptyStatusCounts } from "@/lib/insights/aggregations";
import type { AnalyticsInsights } from "@/lib/insights/types";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const mode = resolveInsightsPageMode(isBackendConfigured());

  if (mode === "demo-preview") {
    return <PreviewSwitch populated={<AnalyticsPopulated />} empty={<AnalyticsEmpty />} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace("/analytics");

  let loadError: string | null = null;
  let data: AnalyticsInsights;

  try {
    data = await getAnalyticsInsights();
  } catch (err) {
    console.error("[analytics]", err);
    loadError = "Could not load analytics. Please try again.";
    data = {
      total_leads: 0,
      lead_list_count: 0,
      campaign_count: 0,
      campaign_by_status: emptyStatusCounts(),
      leads_by_list: [],
      leads_created_last_30_days: [],
      campaigns_created_last_30_days: [],
      outreach: emptyOutreachSummary(),
      outreach_last_30_days: [],
      campaign_performance: [],
      best_days: [],
    };
  }

  return <AnalyticsLiveView data={data} loadError={loadError} />;
}
