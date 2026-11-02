import { notFound } from "next/navigation";
import { CampaignDetailScreen } from "@/components/screens/campaign-detail-screen";
import { CampaignDetailLive } from "@/components/campaigns/campaign-detail-live";
import { getCampaignById } from "@/lib/campaigns/repository";
import { resolveCampaignsPageMode } from "@/lib/campaigns/page-mode";
import { isBackendConfigured } from "@/lib/env";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";
import { getCampaignById as getDemoCampaign } from "@/data/demo/campaigns";
import { listLeadsForList } from "@/lib/leads/repository";
import { listAccounts } from "@/lib/accounts/repository";
import type { AccountOption } from "@/lib/accounts/types";
import type { LeadStatus } from "@/lib/leads/types";

type Props = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params;
  const mode = resolveCampaignsPageMode(isBackendConfigured());

  if (mode === "demo-preview") {
    const campaign = getDemoCampaign(id);
    if (!campaign) notFound();
    return <CampaignDetailScreen campaign={campaign} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace(`/campaigns/${id}`);

  const campaign = await getCampaignById(id);
  if (!campaign) notFound();

  let leadsPreview: {
    id: string;
    name: string;
    company: string | null;
    job_title: string | null;
    status: LeadStatus;
    skip_reason: string | null;
  }[] = [];
  if (campaign.lead_list_id) {
    try {
      const page = await listLeadsForList(campaign.lead_list_id, { page: 1, pageSize: 10 });
      leadsPreview = page.leads.map((l) => ({
        id: l.id,
        name: [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "—",
        company: l.company,
        job_title: l.job_title,
        status: l.status,
        skip_reason: l.skip_reason,
      }));
    } catch {
      leadsPreview = [];
    }
  }

  let accounts: AccountOption[] = [];
  try {
    accounts = (await listAccounts()).map((a) => ({
      id: a.id,
      label: a.display_name,
      status: a.status,
      daily_limit: a.daily_limit,
    }));
  } catch {
    accounts = [];
  }

  return <CampaignDetailLive campaign={campaign} leadsPreview={leadsPreview} accounts={accounts} />;
}
