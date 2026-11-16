import { LinkedInAccount, PLAN_DAILY_LIMIT, Workspace, type LinkedInAccountDoc, type WorkspacePlan } from "../models";
import { env } from "../config/env";
import { decrypt, encrypt, encryptJSON } from "../utils/encryption";
import { AppError, badRequest, conflict, isAppError, notFound, unprocessable } from "../utils/errors";
import * as linkedinActions from "../services/playwright/linkedinActions";
import * as containerManager from "../services/docker/containerManager";
import { browserOptions, getCookies, pauseCampaignsForAccount } from "../services/accountSession";
import { ensureInboxPoll, removeInboxPoll } from "../services/scheduler/dailyScheduler";
import { logEvent } from "../services/events";
import type { SessionCookie } from "../services/playwright/linkedinActions";
import * as browserConnect from "../services/playwright/browserConnectSessions";
import { parseLinkedInSessionCookies, normalizeLinkedInCookiesForPlaywright } from "../utils/linkedinCookies";
import { parseProxyUrl, proxyDisplayHost, proxyToUrl } from "../utils/proxy";
import { isValidTimezone } from "../utils/schedule";
import { checkProxy } from "../services/proxyCheck";
import { oid, type AuthContext } from "./context";

const { ERRORS } = linkedinActions;
export const CHALLENGE_MESSAGE = "LinkedIn requires verification. Please log in manually and try again.";
export const CONNECT_LOGIN_FAILED = "Could not connect the LinkedIn account. Please try again later.";
export const INVALID_SESSION_COOKIES =
  "LinkedIn rejected these session cookies. Sign in at linkedin.com, then paste li_at and JSESSIONID (or a full cookie export from DevTools) and try again.";
export const SESSION_REQUIRED = "SESSION_REQUIRED";
export const PROXY_FAILED_MESSAGE =
  "Could not reach LinkedIn through this account's proxy. Check the proxy host, port, username and password, and that the proxy plan is active.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function workspaceDailyCap(workspaceId: string): Promise<number> {
  const workspace = await Workspace.findById(workspaceId);
  const planCap = PLAN_DAILY_LIMIT[(workspace?.plan as WorkspacePlan) || "starter"] || 10;
  return Math.min(workspace?.dailyLimitPerAccount || 10, planCap);
}

export async function resolveAccountDailyLimit(workspaceId: string, requested: unknown): Promise<number> {
  const cap = await workspaceDailyCap(workspaceId);
  if (requested === undefined || requested === null || requested === "") return cap;
  const n = Number(requested);
  if (!Number.isInteger(n) || n < 1) throw badRequest("Daily limit must be a positive integer");
  if (n > cap) throw badRequest(`Daily limit cannot exceed ${cap} for this workspace`);
  return n;
}

type NetworkInput = { proxyUrl?: unknown; timezone?: unknown };

/**
 * Applies proxy / timezone input to an account (not saved here).
 * `proxyUrl`: undefined leaves it alone, empty or null removes it, anything else replaces it.
 */
async function applyNetworkInput(account: LinkedInAccountDoc, input: NetworkInput) {
  if (input.proxyUrl !== undefined) {
    const raw = input.proxyUrl === null ? "" : String(input.proxyUrl).trim();
    if (!raw) {
      account.set("proxyUrlEncrypted", undefined);
      account.set("proxyHost", undefined);
    } else {
      const proxy = parseProxyUrl(raw);
      await checkProxy(proxy);
      account.proxyUrlEncrypted = encrypt(proxyToUrl(proxy));
      account.proxyHost = proxyDisplayHost(proxy);
    }
  }
  if (input.timezone !== undefined && input.timezone !== null && String(input.timezone).trim()) {
    if (!isValidTimezone(input.timezone)) throw badRequest("timezone must be a valid IANA timezone");
    account.timezone = input.timezone;
  }
}

/** Validates proxy / timezone input before an account is created, and defaults the timezone to the workspace's. */
async function networkFieldsForCreate(workspaceId: AuthContext["workspaceId"], input: NetworkInput) {
  const fields: { proxyUrlEncrypted?: string; proxyHost?: string; timezone?: string } = {};
  const raw = input.proxyUrl === undefined || input.proxyUrl === null ? "" : String(input.proxyUrl).trim();
  if (raw) {
    const proxy = parseProxyUrl(raw);
    await checkProxy(proxy);
    fields.proxyUrlEncrypted = encrypt(proxyToUrl(proxy));
    fields.proxyHost = proxyDisplayHost(proxy);
  }
  if (input.timezone !== undefined && input.timezone !== null && String(input.timezone).trim()) {
    if (!isValidTimezone(input.timezone)) throw badRequest("timezone must be a valid IANA timezone");
    fields.timezone = input.timezone;
  } else {
    const workspace = await Workspace.findById(workspaceId).select("timezone");
    if (workspace?.timezone) fields.timezone = workspace.timezone;
  }
  return fields;
}

const isProxyFailure = (err: unknown) => (err as Error)?.message === ERRORS.PROXY_FAILED;

async function findAccount(ctx: AuthContext, id: string, { withSecrets = false } = {}): Promise<LinkedInAccountDoc> {
  const query = LinkedInAccount.findOne({ _id: oid(id, "account id"), workspaceId: ctx.workspaceId });
  if (withSecrets) query.select("+sessionCookies +linkedinPasswordEncrypted");
  const account = await query;
  if (!account) throw notFound("LinkedIn account not found");
  return account;
}

async function ensureBrowserContainer(account: LinkedInAccountDoc) {
  try {
    const container = await containerManager.ensureContainer(account._id);
    if (container) {
      account.containerId = container.containerId;
      account.containerPort = container.containerPort;
    }
  } catch (err) {
    account.status = "disconnected";
    await account.save();
    throw new AppError(503, CONNECT_LOGIN_FAILED);
  }
}

async function persistSession(account: LinkedInAccountDoc, cookies: SessionCookie[], source: string) {
  const normalized = normalizeLinkedInCookiesForPlaywright(cookies);
  account.sessionCookies = encryptJSON(normalized);
  account.status = "active";
  account.flagReason = undefined;
  account.lastHealthCheck = new Date();
  try {
    const profile = await linkedinActions.fetchOwnProfile(normalized, browserOptions(account));
    if (profile?.fullName) account.fullName = profile.fullName;
    if (profile?.headline) account.headline = profile.headline;
    if (profile?.profileUrl) account.profileUrl = profile.profileUrl;
  } catch {
    // Profile details are cosmetic; a failed scrape shouldn't block connecting the account.
  }
  await account.save();
  await logEvent({
    workspaceId: account.workspaceId,
    linkedinAccountId: account._id,
    eventType: "session_refreshed",
    payload: { source },
  });
  await ensureInboxPoll(account._id).catch((err: Error) =>
    console.error("[accounts] inbox poll schedule failed:", err.message),
  );
}

/** Starts the browser container (if enabled), logs in and stores the session. Throws AppError on failure. */
async function connectSession(account: LinkedInAccountDoc, password: string) {
  await ensureBrowserContainer(account);

  let cookies: SessionCookie[];
  try {
    cookies = await linkedinActions.loginToLinkedIn(account.linkedinEmail, password, browserOptions(account));
  } catch (err) {
    const message = (err as Error).message;
    if (message === ERRORS.CHALLENGE_REQUIRED) {
      account.status = "flagged";
      account.flagReason = ERRORS.CHALLENGE_REQUIRED;
      await account.save();
      throw unprocessable(CHALLENGE_MESSAGE, ERRORS.CHALLENGE_REQUIRED);
    }
    account.status = "disconnected";
    await account.save();
    if (message === ERRORS.PROXY_FAILED) throw unprocessable(PROXY_FAILED_MESSAGE, ERRORS.PROXY_FAILED);
    if (message === ERRORS.INVALID_CREDENTIALS) {
      throw unprocessable("LinkedIn rejected the email or password", ERRORS.INVALID_CREDENTIALS);
    }
    console.error("[accounts] LinkedIn login failed:", message);
    throw new AppError(502, CONNECT_LOGIN_FAILED);
  }

  await persistSession(account, cookies, "connect_password");
}

async function applyImportedSession(
  account: LinkedInAccountDoc,
  rawCookies: unknown,
  source: "connect_browser" | "connect_session_import" | "reconnect_session_import",
) {
  const cookies = parseLinkedInSessionCookies(rawCookies);
  await ensureBrowserContainer(account);
  let verified: { valid: boolean; error?: string };
  try {
    verified = await linkedinActions.verifyCookies(cookies, browserOptions(account));
  } catch (err) {
    if (!isProxyFailure(err)) throw err;
    account.status = "disconnected";
    await account.save();
    throw unprocessable(PROXY_FAILED_MESSAGE, ERRORS.PROXY_FAILED);
  }
  if (!verified.valid) {
    account.status = "disconnected";
    await account.save();
    throw unprocessable(INVALID_SESSION_COOKIES, "INVALID_SESSION_COOKIES");
  }
  await persistSession(account, cookies, source);
}

async function createAccountFromBrowserSession(
  ctx: AuthContext,
  cookies: SessionCookie[],
  input: { linkedinEmail: string; label?: string; dailyLimit?: number } & NetworkInput,
) {
  const email = input.linkedinEmail.toLowerCase().trim();
  if (await LinkedInAccount.exists({ workspaceId: ctx.workspaceId, linkedinEmail: email })) {
    throw conflict("This LinkedIn account is already connected");
  }
  const account = await LinkedInAccount.create({
    workspaceId: ctx.workspaceId,
    linkedinEmail: email,
    label: input.label,
    dailyLimit: await resolveAccountDailyLimit(ctx.workspaceId, input.dailyLimit),
    status: "connecting",
    ...(await networkFieldsForCreate(ctx.workspaceId, input)),
  });
  await applyImportedSession(account, cookies, "connect_browser");
  return String(account._id);
}

export async function connectAccountWithSessionCookies(
  ctx: AuthContext,
  input: { linkedinEmail: unknown; sessionCookies: unknown; dailyLimit?: unknown; label?: unknown } & NetworkInput,
) {
  if (!input.linkedinEmail || !EMAIL_RE.test(String(input.linkedinEmail).trim())) {
    throw badRequest("A valid LinkedIn email is required (used as the account id in Reachly)");
  }
  const email = String(input.linkedinEmail).toLowerCase().trim();
  if (await LinkedInAccount.exists({ workspaceId: ctx.workspaceId, linkedinEmail: email })) {
    throw conflict("This LinkedIn account is already connected");
  }

  const account = await LinkedInAccount.create({
    workspaceId: ctx.workspaceId,
    linkedinEmail: email,
    label: input.label ? String(input.label).trim() : undefined,
    dailyLimit: await resolveAccountDailyLimit(ctx.workspaceId, input.dailyLimit),
    status: "connecting",
    ...(await networkFieldsForCreate(ctx.workspaceId, input)),
  });

  try {
    await applyImportedSession(account, input.sessionCookies, "connect_session_import");
  } catch (err) {
    if (!isAppError(err)) {
      console.error("[accounts] session import failed:", (err as Error).message);
      throw new AppError(502, CONNECT_LOGIN_FAILED);
    }
    throw err;
  }

  return LinkedInAccount.findById(account._id);
}

export async function connectAccount(
  ctx: AuthContext,
  input: { linkedinEmail: unknown; linkedinPassword: unknown; dailyLimit?: unknown; label?: unknown } & NetworkInput,
) {
  if (!input.linkedinEmail || !EMAIL_RE.test(String(input.linkedinEmail).trim())) {
    throw badRequest("A valid LinkedIn email is required");
  }
  if (!input.linkedinPassword) throw badRequest("LinkedIn password is required");
  const email = String(input.linkedinEmail).toLowerCase().trim();
  const password = String(input.linkedinPassword);
  if (await LinkedInAccount.exists({ workspaceId: ctx.workspaceId, linkedinEmail: email })) {
    throw conflict("This LinkedIn account is already connected");
  }

  const account = await LinkedInAccount.create({
    workspaceId: ctx.workspaceId,
    linkedinEmail: email,
    label: input.label ? String(input.label).trim() : undefined,
    linkedinPasswordEncrypted: encrypt(password),
    dailyLimit: await resolveAccountDailyLimit(ctx.workspaceId, input.dailyLimit),
    status: "connecting",
    ...(await networkFieldsForCreate(ctx.workspaceId, input)),
  });

  await connectSession(account, password);
  return LinkedInAccount.findById(account._id);
}

export async function listAccounts(ctx: AuthContext) {
  return LinkedInAccount.find({ workspaceId: ctx.workspaceId }).sort({ createdAt: -1 });
}

export async function accountStatus(ctx: AuthContext, id: string) {
  const account = await findAccount(ctx, id, { withSecrets: true });
  const cookies = getCookies(account);
  let valid = false;
  if (cookies) {
    try {
      const result = await linkedinActions.verifyCookies(cookies, browserOptions(account));
      valid = Boolean(result.valid);
    } catch (err) {
      if (isProxyFailure(err)) throw unprocessable(PROXY_FAILED_MESSAGE, ERRORS.PROXY_FAILED);
      throw err;
    }
  }
  const lastHealthCheck = new Date();
  await LinkedInAccount.updateOne({ _id: account._id }, { $set: { lastHealthCheck } });
  return {
    status: account.status,
    valid,
    todaySentCount: account.todaySentCount,
    dailyLimit: account.dailyLimit,
    lastHealthCheck,
    lastSentAt: account.lastSentAt,
  };
}

export async function reconnectAccount(
  ctx: AuthContext,
  id: string,
  input: { linkedinPassword?: unknown; sessionCookies?: unknown; dailyLimit?: unknown } & NetworkInput = {},
) {
  const account = await findAccount(ctx, id, { withSecrets: true });
  await applyNetworkInput(account, input);
  // Accounts connected before timezones existed (or via OIDC) pick up the workspace timezone here.
  if (!account.timezone) {
    const workspace = await Workspace.findById(ctx.workspaceId).select("timezone");
    if (workspace?.timezone) account.timezone = workspace.timezone;
  }
  if (input.linkedinPassword) account.linkedinPasswordEncrypted = encrypt(String(input.linkedinPassword));
  if (input.dailyLimit !== undefined) account.dailyLimit = await resolveAccountDailyLimit(ctx.workspaceId, input.dailyLimit);
  account.status = "connecting";
  await account.save();

  if (input.sessionCookies !== undefined && String(input.sessionCookies).trim()) {
    try {
      await applyImportedSession(account, input.sessionCookies, "reconnect_session_import");
    } catch (err) {
      if (!isAppError(err)) {
        console.error("[accounts] session reconnect failed:", (err as Error).message);
        throw new AppError(502, CONNECT_LOGIN_FAILED);
      }
      throw err;
    }
    return LinkedInAccount.findById(account._id);
  }

  if (!account.linkedinPasswordEncrypted) {
    throw badRequest("Paste fresh session cookies or add a LinkedIn password to reconnect.");
  }

  const password = input.linkedinPassword
    ? String(input.linkedinPassword)
    : decrypt(account.linkedinPasswordEncrypted);
  await connectSession(account, password);
  return LinkedInAccount.findById(account._id);
}

export async function startBrowserConnect(
  ctx: AuthContext,
  input: { linkedinEmail: unknown; dailyLimit?: unknown; label?: unknown } & NetworkInput,
) {
  if (!input.linkedinEmail || !EMAIL_RE.test(String(input.linkedinEmail).trim())) {
    throw badRequest("A valid LinkedIn email is required (used as the account id in Reachly)");
  }
  const linkedinEmail = String(input.linkedinEmail).toLowerCase().trim();
  if (await LinkedInAccount.exists({ workspaceId: ctx.workspaceId, linkedinEmail })) {
    throw conflict("This LinkedIn account is already connected");
  }
  const label = input.label ? String(input.label).trim() : undefined;
  const dailyLimit = await resolveAccountDailyLimit(ctx.workspaceId, input.dailyLimit);
  // Validate now so a bad proxy is reported before the sign-in window opens.
  await networkFieldsForCreate(ctx.workspaceId, input);
  const network: NetworkInput = { proxyUrl: input.proxyUrl, timezone: input.timezone };

  if (!env.browserConnectEnabled) {
    throw unprocessable(
      "Browser sign-in only works when Reachly runs on your computer (npm run dev). On Render and other cloud hosts, paste session cookies or use email and password.",
    );
  }

  try {
    return await browserConnect.startBrowserConnectSession({
      workspaceId: String(ctx.workspaceId),
      userId: String(ctx.userId),
      onSuccess: (cookies) => createAccountFromBrowserSession(ctx, cookies, { linkedinEmail, label, dailyLimit, ...network }),
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "BROWSER_CONNECT_IN_PROGRESS") {
      throw conflict("A browser sign-in is already in progress for this workspace. Finish or cancel it first.");
    }
    console.error("[accounts] browser connect failed:", message);
    if (/Executable doesn't exist|Failed to launch/i.test(message)) {
      throw unprocessable(
        "Chromium is missing or could not start. In the project folder run: npm run browsers:install — then stop and restart npm run dev. Or use Paste session cookies instead.",
        "BROWSER_LAUNCH_FAILED",
      );
    }
    if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|TIMED_OUT|Timeout/i.test(message)) {
      throw unprocessable(
        "Reachly could not load LinkedIn in the local browser (network or timeout). Check your internet or use Paste session cookies.",
        "BROWSER_LAUNCH_FAILED",
      );
    }
    throw unprocessable(
      message
        ? `Could not open the LinkedIn browser: ${message}`
        : "Could not open the LinkedIn browser. Use Paste session cookies, or run npm run browsers:install and restart npm run dev.",
      "BROWSER_LAUNCH_FAILED",
    );
  }
}

export function browserConnectStatus(ctx: AuthContext, sessionId: string) {
  const snap = browserConnect.getBrowserConnectSession(String(ctx.workspaceId), sessionId);
  if (!snap) throw notFound("Browser sign-in session not found or expired");
  return snap;
}

export async function cancelBrowserConnect(ctx: AuthContext, sessionId: string) {
  const ok = await browserConnect.cancelBrowserConnectSession(String(ctx.workspaceId), sessionId);
  if (!ok) throw notFound("Browser sign-in session not found or expired");
  return { cancelled: true };
}

export async function updateAccount(
  ctx: AuthContext,
  id: string,
  input: { label?: unknown; dailyLimit?: unknown } & NetworkInput,
) {
  const account = await findAccount(ctx, id);
  await applyNetworkInput(account, input);
  if (input.label !== undefined) account.label = input.label ? String(input.label).trim() : undefined;
  if (input.dailyLimit !== undefined) account.dailyLimit = await resolveAccountDailyLimit(ctx.workspaceId, input.dailyLimit);
  await account.save();
  return account;
}

export async function removeAccount(ctx: AuthContext, id: string) {
  const account = await findAccount(ctx, id);
  await pauseCampaignsForAccount(account._id, "account_removed");
  await removeInboxPoll(account._id).catch(() => undefined);
  if (account.containerId) await containerManager.removeContainer(account.containerId).catch(() => undefined);
  await account.deleteOne();
  return { id: String(account._id) };
}
