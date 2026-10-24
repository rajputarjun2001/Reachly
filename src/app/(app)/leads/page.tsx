import { PreviewSwitch } from "@/components/screens/preview-switch";
import { LeadsEmpty, LeadsPopulated } from "@/components/screens/leads-screen";
import { LeadsLiveView } from "@/components/leads/leads-live-view";
import { isBackendConfigured } from "@/lib/env";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";
import { listLeadLists } from "@/lib/leads/repository";
import { resolveLeadsPageMode } from "@/lib/leads/page-mode";

/** Must be dynamic: static build has no session and previously baked in demo leads UI. */
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const mode = resolveLeadsPageMode(isBackendConfigured());

  if (mode === "demo-preview") {
    return (
      <PreviewSwitch
        populated={<LeadsPopulated />}
        empty={<LeadsEmpty />}
      />
    );
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace("/leads");

  let lists: Awaited<ReturnType<typeof listLeadLists>> = [];
  let loadError: string | null = null;

  try {
    lists = await listLeadLists();
  } catch {
    loadError = "Could not load lead lists. Please try again.";
  }

  return <LeadsLiveView initialLists={lists} loadError={loadError} />;
}
