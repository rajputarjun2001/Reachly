import { PreviewSwitch } from "@/components/screens/preview-switch";
import { DashboardEmpty, DashboardPopulated } from "@/components/screens/dashboard-screen";

export default function DashboardPage() {
  return <PreviewSwitch populated={<DashboardPopulated />} empty={<DashboardEmpty />} />;
}
