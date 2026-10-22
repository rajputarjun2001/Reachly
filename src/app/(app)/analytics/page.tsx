import { redirect } from "next/navigation";
import { PreviewSwitch } from "@/components/screens/preview-switch";
import { AnalyticsEmpty, AnalyticsPopulated } from "@/components/screens/analytics-screen";
import { AnalyticsLiveView } from "@/components/analytics/analytics-live-view";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { resolveInsightsPageMode } from "@/lib/insights/page-mode";
import { getAnalyticsInsights, InsightsDataError } from "@/lib/insights/repository";
import { emptyStatusCounts } from "@/lib/insights/aggregations";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const mode = resolveInsightsPageMode(isSupabaseConfigured());

  if (mode === "demo-preview") {
    return <PreviewSwitch populated={<AnalyticsPopulated />} empty={<AnalyticsEmpty />} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) {
    const supabase = await createClientIfConfigured();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user) redirect("/login?next=/analytics");
    redirect("/workspace/setup");
  }

  let loadError: string | null = null;
  let data: Awaited<ReturnType<typeof getAnalyticsInsights>>;

  try {
    data = await getAnalyticsInsights();
  } catch (err) {
    if (err instanceof InsightsDataError) {
      loadError = err.message;
    } else {
      loadError = "Could not load analytics. Please try again.";
    }
    data = {
      total_leads: 0,
      lead_list_count: 0,
      campaign_count: 0,
      campaign_by_status: emptyStatusCounts(),
      leads_by_list: [],
      leads_created_last_30_days: [],
      campaigns_created_last_30_days: [],
    };
  }

  return <AnalyticsLiveView data={data} loadError={loadError} />;
}
