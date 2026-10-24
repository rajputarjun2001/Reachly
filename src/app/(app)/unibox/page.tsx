import { PreviewSwitch } from "@/components/screens/preview-switch";
import { UniboxEmpty, UniboxPopulated } from "@/components/screens/unibox-screen";
import { UniboxLiveView } from "@/components/unibox/unibox-live-view";
import { isBackendConfigured } from "@/lib/env";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";
import { resolveUniboxPageMode } from "@/lib/unibox/page-mode";
import {
  getConversationWithMessages,
  listConversations,
  markConversationRead,
} from "@/lib/unibox/repository";

export const dynamic = "force-dynamic";

export default async function UniboxPage() {
  const mode = resolveUniboxPageMode(isBackendConfigured());

  if (mode === "demo-preview") {
    return <PreviewSwitch populated={<UniboxPopulated />} empty={<UniboxEmpty />} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace("/unibox");

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
    const first = list.conversations[0];
    if (first) {
      initialDetail = await getConversationWithMessages(first.id);
      if (first.has_unread) await markConversationRead(first.id);
    }
  } catch {
    loadError = "Could not load Unibox. Please try again.";
  }

  return (
    <UniboxLiveView
      initialList={list.conversations}
      initialDetail={initialDetail}
      loadError={loadError}
    />
  );
}
