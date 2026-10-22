import { redirect } from "next/navigation";
import { PreviewSwitch } from "@/components/screens/preview-switch";
import { UniboxEmpty, UniboxPopulated } from "@/components/screens/unibox-screen";
import { UniboxLiveView } from "@/components/unibox/unibox-live-view";
import { isSupabaseConfigured } from "@/lib/env";
import { getWorkspaceContext } from "@/lib/workspace/context";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { resolveUniboxPageMode } from "@/lib/unibox/page-mode";
import {
  getConversationWithMessages,
  listConversations,
  UniboxDataError,
} from "@/lib/unibox/repository";

export const dynamic = "force-dynamic";

export default async function UniboxPage() {
  const mode = resolveUniboxPageMode(isSupabaseConfigured());

  if (mode === "demo-preview") {
    return <PreviewSwitch populated={<UniboxPopulated />} empty={<UniboxEmpty />} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) {
    const supabase = await createClientIfConfigured();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (!user) redirect("/login?next=/unibox");
    redirect("/workspace/setup");
  }

  let loadError: string | null = null;
  let list: Awaited<ReturnType<typeof listConversations>> = {
    conversations: [],
    total: 0,
    page: 1,
    pageSize: 25,
  };
  let initialDetail = null;

  try {
    list = await listConversations({ status: "all", page: 1 });
    if (list.conversations[0]) {
      initialDetail = await getConversationWithMessages(list.conversations[0].id);
    }
  } catch (err) {
    if (err instanceof UniboxDataError) {
      loadError =
        err.code === "SCHEMA_MISSING"
          ? `${err.message} Run supabase db push (see docs/SETUP.md).`
          : err.message;
    } else {
      loadError = "Could not load Unibox. Please try again.";
    }
  }

  return (
    <UniboxLiveView
      initialList={list.conversations}
      initialDetail={initialDetail}
      loadError={loadError}
    />
  );
}
