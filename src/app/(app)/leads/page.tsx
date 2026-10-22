import { redirect } from "next/navigation";
import { PreviewSwitch } from "@/components/screens/preview-switch";
import { LeadsEmpty, LeadsPopulated } from "@/components/screens/leads-screen";
import { LeadsLiveView } from "@/components/leads/leads-live-view";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { listLeadLists, LeadDataError } from "@/lib/leads/repository";
import { resolveLeadsPageMode } from "@/lib/leads/page-mode";
import { createClientIfConfigured } from "@/lib/supabase/server";

/** Must be dynamic: static build has no session and previously baked in demo leads UI. */
export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const mode = resolveLeadsPageMode(isSupabaseConfigured());

  if (mode === "demo-preview") {
    return (
      <PreviewSwitch
        populated={<LeadsPopulated />}
        empty={<LeadsEmpty />}
      />
    );
  }

  const workspace = await getWorkspaceContext();

  if (!workspace) {
    const supabase = await createClientIfConfigured();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user) {
      redirect("/login?next=/leads");
    }
    redirect("/workspace/setup");
  }

  let lists: Awaited<ReturnType<typeof listLeadLists>> = [];
  let loadError: string | null = null;

  try {
    lists = await listLeadLists();
  } catch (err) {
    if (err instanceof LeadDataError) {
      loadError =
        err.code === "SCHEMA_MISSING"
          ? `${err.message} Run supabase db push (see docs/SETUP.md).`
          : err.message;
    } else {
      loadError = "Could not load lead lists. Please try again.";
    }
  }

  return <LeadsLiveView initialLists={lists} loadError={loadError} />;
}
