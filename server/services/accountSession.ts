import type { Types } from "mongoose";
import { Campaign, LinkedInAccount, type LinkedInAccountDoc } from "../models";
import { decrypt, decryptJSON, encryptJSON } from "../utils/encryption";
import { normalizeLinkedInCookiesForPlaywright } from "../utils/linkedinCookies";
import * as linkedinActions from "./playwright/linkedinActions";
import type { ActionResult, BrowserOptions, SessionCookie } from "./playwright/linkedinActions";
import { wsEndpointFor } from "./docker/containerManager";
import { env } from "../config/env";
import { parseProxyUrl, type ProxySettings } from "../utils/proxy";
import { logEvent } from "./events";

const { ERRORS } = linkedinActions;
const FLAG_ERRORS = new Set<string>([ERRORS.ACCOUNT_RESTRICTED, ERRORS.INVITATION_LIMIT, ERRORS.CHALLENGE_REQUIRED]);

export async function loadAccountWithSecrets(accountId: Types.ObjectId | string): Promise<LinkedInAccountDoc | null> {
  return LinkedInAccount.findById(accountId).select("+sessionCookies +linkedinPasswordEncrypted");
}

export function getCookies(account: { sessionCookies?: string | null }): SessionCookie[] | null {
  if (!account.sessionCookies) return null;
  try {
    return decryptJSON<SessionCookie[]>(account.sessionCookies);
  } catch {
    return null;
  }
}

type NetworkFields = { containerPort?: number | null; proxyUrlEncrypted?: string | null; timezone?: string | null };

/**
 * The account's own proxy, else the LINKEDIN_PROXY_URL fallback, else none (direct connection).
 * Throws when a proxy is configured but unreadable: sending from the server's IP instead would
 * be exactly the leak the proxy exists to prevent.
 */
export function accountProxy(account: NetworkFields): ProxySettings | undefined {
  if (account.proxyUrlEncrypted) return parseProxyUrl(decrypt(account.proxyUrlEncrypted));
  return env.linkedinProxyUrl ? parseProxyUrl(env.linkedinProxyUrl) : undefined;
}

export function browserOptions(account: NetworkFields): BrowserOptions {
  return {
    wsEndpoint: wsEndpointFor(account),
    proxy: accountProxy(account),
    timezoneId: account.timezone || undefined,
  };
}

export async function pauseCampaignsForAccount(accountId: Types.ObjectId | string, reason: string) {
  const campaigns = await Campaign.find({ linkedinAccountId: accountId, status: "active" }).select("_id");
  if (campaigns.length) {
    await Campaign.updateMany(
      { _id: { $in: campaigns.map((c) => c._id) } },
      { $set: { status: "paused", pausedReason: reason } },
    );
  }
  return campaigns.map((c) => c._id);
}

export async function flagAccount(account: LinkedInAccountDoc, reason: string) {
  account.status = "flagged";
  account.flagReason = reason;
  account.warningCount = (account.warningCount || 0) + 1;
  await account.save();
  const pausedCampaignIds = await pauseCampaignsForAccount(account._id, `account_flagged:${reason}`);
  await logEvent({
    workspaceId: account.workspaceId,
    linkedinAccountId: account._id,
    eventType: "account_flagged",
    payload: { reason, pausedCampaignIds },
  });
  return pausedCampaignIds;
}

/** Logs in with the stored password and persists fresh cookies. Returns the cookie array. */
export async function refreshSession(account: LinkedInAccountDoc): Promise<SessionCookie[]> {
  if (!account.linkedinPasswordEncrypted) throw new Error("NO_STORED_PASSWORD");
  const password = decrypt(account.linkedinPasswordEncrypted);
  const cookies = normalizeLinkedInCookiesForPlaywright(
    await linkedinActions.loginToLinkedIn(account.linkedinEmail, password, browserOptions(account)),
  );
  account.sessionCookies = encryptJSON(cookies);
  account.status = "active";
  account.flagReason = undefined;
  await account.save();
  await logEvent({
    workspaceId: account.workspaceId,
    linkedinAccountId: account._id,
    eventType: "session_refreshed",
    payload: {},
  });
  return cookies;
}

export type SessionResult<T extends ActionResult> = T & { refreshed?: boolean; flagged?: boolean };

/**
 * Runs a LinkedIn action with the account's cookies. On SESSION_EXPIRED it re-logs in and
 * retries once; if that fails, or LinkedIn shows a warning, the account is flagged and its
 * active campaigns are paused.
 */
export async function runWithSession<T extends ActionResult>(
  account: LinkedInAccountDoc,
  action: (cookies: SessionCookie[], opts: BrowserOptions) => Promise<T>,
): Promise<SessionResult<T>> {
  let cookies = getCookies(account);
  let result: T = cookies
    ? await action(cookies, browserOptions(account))
    : ({ success: false, error: ERRORS.SESSION_EXPIRED } as T);
  let refreshed = false;

  if (result.error === ERRORS.SESSION_EXPIRED) {
    try {
      cookies = await refreshSession(account);
    } catch (err) {
      const message = (err as Error).message;
      await flagAccount(account, message === ERRORS.CHALLENGE_REQUIRED ? ERRORS.CHALLENGE_REQUIRED : "relogin_failed");
      return { ...result, success: false, error: ERRORS.SESSION_EXPIRED, flagged: true };
    }
    refreshed = true;
    result = await action(cookies, browserOptions(account));
    if (result.error === ERRORS.SESSION_EXPIRED) {
      await flagAccount(account, "session_expired_after_relogin");
      return { ...result, flagged: true, refreshed };
    }
  }

  if (result.error && FLAG_ERRORS.has(result.error)) {
    await flagAccount(account, result.error);
    return { ...result, flagged: true, refreshed };
  }
  return { ...result, refreshed };
}
