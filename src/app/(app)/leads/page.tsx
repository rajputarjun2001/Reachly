import { PreviewSwitch } from "@/components/screens/preview-switch";
import { LeadsEmpty, LeadsPopulated } from "@/components/screens/leads-screen";

export default function LeadsPage() {
  return <PreviewSwitch populated={<LeadsPopulated />} empty={<LeadsEmpty />} />;
}
