import { PreviewSwitch } from "@/components/screens/preview-switch";
import { AnalyticsEmpty, AnalyticsPopulated } from "@/components/screens/analytics-screen";

export default function AnalyticsPage() {
  return <PreviewSwitch populated={<AnalyticsPopulated />} empty={<AnalyticsEmpty />} />;
}
