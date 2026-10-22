import { redirect } from "next/navigation";
import { PreviewSwitch } from "@/components/screens/preview-switch";
import { CampaignsEmpty, CampaignsPopulated } from "@/components/screens/campaigns-screen";
import { CampaignsLiveView } from "@/components/campaigns/campaigns-live-view";
import { listCampaigns, CampaignDataError } from "@/lib/campaigns/repository";
import { resolveCampaignsPageMode } from "@/lib/campaigns/page-mode";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClientIfConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const mode = resolveCampaignsPageMode(isSupabaseConfigured());

  if (mode === "demo-preview") {
    return (
      <PreviewSwitch
        populated={<CampaignsPopulated />}
        empty={<CampaignsEmpty />}
      />
    );
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) {
    const supabase = await createClientIfConfigured();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user) redirect("/login?next=/campaigns");
    redirect("/workspace/setup");
  }

  let campaigns: Awaited<ReturnType<typeof listCampaigns>> = [];
  let loadError: string | null = null;
  try {
    campaigns = await listCampaigns();
  } catch (err) {
    if (err instanceof CampaignDataError) {
      loadError =
        err.code === "SCHEMA_MISSING"
          ? `${err.message} Run supabase db push (see docs/SETUP.md).`
          : err.message;
    } else {
      loadError = "Could not load campaigns. Please try again.";
    }
  }

  return <CampaignsLiveView initialCampaigns={campaigns} loadError={loadError} />;
}
