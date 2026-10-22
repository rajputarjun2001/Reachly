import { PreviewSwitch } from "@/components/screens/preview-switch";
import { LeadsEmpty, LeadsPopulated } from "@/components/screens/leads-screen";
import { LeadsLiveView } from "@/components/leads/leads-live-view";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { listLeadLists } from "@/lib/leads/repository";

export default async function LeadsPage() {
  if (isSupabaseConfigured()) {
    const workspace = await getWorkspaceContext();
    if (workspace) {
      let lists: Awaited<ReturnType<typeof listLeadLists>> = [];
      try {
        lists = await listLeadLists();
      } catch {
        lists = [];
      }
      return <LeadsLiveView initialLists={lists} />;
    }
  }

  return (
    <PreviewSwitch
      populated={<LeadsPopulated />}
      empty={<LeadsEmpty />}
    />
  );
}
