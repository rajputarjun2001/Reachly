import { PreviewSwitch } from "@/components/screens/preview-switch";
import { AccountsEmpty, AccountsPopulated } from "@/components/screens/accounts-screen";
import { AccountsLiveView } from "@/components/accounts/accounts-live-view";
import { listAccounts, workspaceAccountCap } from "@/lib/accounts/repository";
import type { LinkedInAccountView } from "@/lib/accounts/types";
import { isBackendConfigured } from "@/lib/env";
import { getWorkspaceContext, redirectWithoutWorkspace } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

type AccountsPageProps = {
  searchParams: Promise<{
    oauth?: string;
    account_id?: string;
    oauth_error?: string;
  }>;
};

export default async function AccountsPage({ searchParams }: AccountsPageProps) {
  const query = await searchParams;
  if (!isBackendConfigured()) {
    return <PreviewSwitch populated={<AccountsPopulated />} empty={<AccountsEmpty />} />;
  }

  const workspace = await getWorkspaceContext();
  if (!workspace) return redirectWithoutWorkspace("/accounts");

  let accounts: LinkedInAccountView[] = [];
  let dailyCap = 10;
  let loadError: string | null = null;
  try {
    [accounts, dailyCap] = await Promise.all([listAccounts(), workspaceAccountCap()]);
  } catch {
    loadError = "Could not load LinkedIn accounts. Is MongoDB running?";
  }

  return (
    <AccountsLiveView
      accounts={accounts}
      dailyCap={dailyCap}
      loadError={loadError}
      oauthBanner={
        query.oauth === "session_required"
          ? { accountId: query.account_id ?? null }
          : query.oauth_error
            ? { error: query.oauth_error }
            : null
      }
    />
  );
}
