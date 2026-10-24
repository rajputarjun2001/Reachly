import { redirect } from "next/navigation";
import { PreviewSwitch } from "@/components/screens/preview-switch";
import { DashboardEmpty, DashboardPopulated } from "@/components/screens/dashboard-screen";
import { DashboardLiveView } from "@/components/dashboard/dashboard-live-view";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { resolveInsightsPageMode } from "@/lib/insights/page-mode";
import {
  getDashboardInsights,
  getWorkspaceGreetingName,
  InsightsDataError,
} from "@/lib/insights/repository";
import { emptyStatusCounts } from "@/lib/insights/aggregations";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const mode = resolveInsightsPageMode(isSupabaseConfigured());

  if (mode === "demo-preview") {
    return <PreviewSwitch populated={<DashboardPopulated />} empty={<DashboardEmpty />} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) {
    const supabase = await createClientIfConfigured();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user) redirect("/login?next=/dashboard");
    redirect("/workspace/setup");
  }

  let loadError: string | null = null;
  let data: Awaited<ReturnType<typeof getDashboardInsights>> | null = null;
  let greetingName = "there";

  try {
    [data, greetingName] = await Promise.all([getDashboardInsights(), getWorkspaceGreetingName()]);
  } catch (err) {
    if (err instanceof InsightsDataError) {
      loadError = err.message;
      data = {
        total_leads: 0,
        lead_list_count: 0,
        campaign_count: 0,
        campaign_by_status: emptyStatusCounts(),
        recent_campaigns: [],
        leads_added_last_7_days: [],
      };
    } else {
      loadError = "Could not load dashboard. Please try again.";
      data = {
        total_leads: 0,
        lead_list_count: 0,
        campaign_count: 0,
        campaign_by_status: emptyStatusCounts(),
        recent_campaigns: [],
        leads_added_last_7_days: [],
      };
    }
  }

  return <DashboardLiveView data={data!} greetingName={greetingName} loadError={loadError} />;
}
