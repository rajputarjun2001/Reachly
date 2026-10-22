import { notFound } from "next/navigation";
import { CampaignDetailScreen } from "@/components/screens/campaign-detail-screen";
import { getCampaignById } from "@/data/demo/campaigns";

type Props = { params: Promise<{ id: string }> };

export default async function CampaignDetailPage({ params }: Props) {
  const { id } = await params;
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  return <CampaignDetailScreen campaign={campaign} />;
}
