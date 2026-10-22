import { notFound } from "next/navigation";
import { CampaignDetailScreen } from "@/components/screens/campaign-detail-screen";
import { CampaignDetailLive } from "@/components/campaigns/campaign-detail-live";
import { getCampaignById, CampaignDataError } from "@/lib/campaigns/repository";
import { resolveCampaignsPageMode } from "@/lib/campaigns/page-mode";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { getCampaignById as getDemoCampaign } from "@/data/demo/campaigns";
import { listLeadsForList } from "@/lib/leads/repository";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params;
  const mode = resolveCampaignsPageMode(isSupabaseConfigured());

  if (mode === "demo-preview") {
    const campaign = getDemoCampaign(id);
    if (!campaign) notFound();
    return <CampaignDetailScreen campaign={campaign} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) notFound();

  let campaign;
  try {
    campaign = await getCampaignById(id);
  } catch (err) {
    if (err instanceof CampaignDataError && err.code === "SCHEMA_MISSING") {
      return (
        <div className="content" style={{ padding: 24 }}>
          <p role="alert" style={{ color: "#B91C1C" }}>
            {err.message} Run <code>supabase db push</code> (see docs/SETUP.md).
          </p>
        </div>
      );
    }
    notFound();
  }

  if (!campaign) notFound();

  let leadsPreview: { id: string; name: string; company: string | null; job_title: string | null }[] = [];
  if (campaign.lead_list_id) {
    try {
      const page = await listLeadsForList(campaign.lead_list_id, { page: 1, pageSize: 10 });
      leadsPreview = page.leads.map((l) => ({
        id: l.id,
        name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "—",
        company: l.company,
        job_title: l.job_title,
      }));
    } catch {
      leadsPreview = [];
    }
  }

  return <CampaignDetailLive campaign={campaign} leadsPreview={leadsPreview} />;
}
