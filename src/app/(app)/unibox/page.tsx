import { PreviewSwitch } from "@/components/screens/preview-switch";
import { UniboxEmpty, UniboxPopulated } from "@/components/screens/unibox-screen";

export default function UniboxPage() {
  return <PreviewSwitch populated={<UniboxPopulated />} empty={<UniboxEmpty />} />;
}
