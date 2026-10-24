import { PreviewSwitch } from "@/components/screens/preview-switch";
import { CampaignsEmpty, CampaignsPopulated } from "@/components/screens/campaigns-screen";
import { CampaignsLiveView } from "@/components/campaigns/campaigns-live-view";
import { listCampaigns } from "@/lib/campaigns/repository";
import { resolveCampaignsPageMode } from "@/lib/campaigns/page-mode";
import { isBackendConfigured } from "@/lib/env";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const mode = resolveCampaignsPageMode(isBackendConfigured());

  if (mode === "demo-preview") {
    return (
      <PreviewSwitch
        populated={<CampaignsPopulated />}
        empty={<CampaignsEmpty />}
      />
    );
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace("/campaigns");

  let campaigns: Awaited<ReturnType<typeof listCampaigns>> = [];
  let loadError: string | null = null;
  try {
    campaigns = await listCampaigns();
  } catch {
    loadError = "Could not load campaigns. Please try again.";
  }

  return <CampaignsLiveView initialCampaigns={campaigns} loadError={loadError} />;
}
