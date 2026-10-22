import { PreviewSwitch } from "@/components/screens/preview-switch";
import { CampaignsEmpty, CampaignsPopulated } from "@/components/screens/campaigns-screen";

export default function CampaignsPage() {
  return <PreviewSwitch populated={<CampaignsPopulated />} empty={<CampaignsEmpty />} />;
}
