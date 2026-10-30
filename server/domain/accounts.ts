import { LinkedInAccount, PLAN_DAILY_LIMIT, Workspace, type LinkedInAccountDoc, type WorkspacePlan } from "../models";
import { env } from "../config/env";
import { decrypt, encrypt, encryptJSON } from "../utils/encryption";
import { AppError, badRequest, conflict, notFound, unprocessable } from "../utils/errors";
import * as linkedinActions from "../services/playwright/linkedinActions";
import * as containerManager from "../services/docker/containerManager";
import { browserOptions, getCookies, pauseCampaignsForAccount } from "../services/accountSession";
import { ensureInboxPoll, removeInboxPoll } from "../services/scheduler/dailyScheduler";
import { logEvent } from "../services/events";
import type { SessionCookie } from "../services/playwright/linkedinActions";
import * as browserConnect from "../services/playwright/browserConnectSessions";
import { oid, type AuthContext } from "./context";

const { ERRORS } = linkedinActions;
export const CHALLENGE_MESSAGE = "LinkedIn requires verification. Please log in manually and try again.";
export const CONNECT_LOGIN_FAILED = "Could not connect the LinkedIn account. Please try again later.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function workspaceDailyCap(workspaceId: string): Promise<number> {
  const workspace = await Workspace.findById(workspaceId);
  const planCap = PLAN_DAILY_LIMIT[(workspace?.plan as WorkspacePlan) || "starter"] || 10;
  return Math.min(workspace?.dailyLimitPerAccount || 10, planCap);
}

async function resolveDailyLimit(workspaceId: string, requested: unknown): Promise<number> {
  const cap = await workspaceDailyCap(workspaceId);
  if (requested === undefined || requested === null || requested === "") return cap;
  const n = Number(requested);
  if (!Number.isInteger(n) || n < 1) throw badRequest("Daily limit must be a positive integer");
  if (n > cap) throw badRequest(`Daily limit cannot exceed ${cap} for this workspace`);
  return n;
}

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
  account.sessionCookies = encryptJSON(cookies);
  account.status = "active";
  account.flagReason = undefined;
  account.lastHealthCheck = new Date();
  try {
    const profile = await linkedinActions.fetchOwnProfile(cookies, browserOptions(account));
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
    if (message === ERRORS.INVALID_CREDENTIALS) {
      throw unprocessable("LinkedIn rejected the email or password", ERRORS.INVALID_CREDENTIALS);
    }
    console.error("[accounts] LinkedIn login failed:", message);
    throw new AppError(502, CONNECT_LOGIN_FAILED);
  }

  await persistSession(account, cookies, "connect_password");
}

async function createAccountFromBrowserSession(
  ctx: AuthContext,
  cookies: SessionCookie[],
  input: { linkedinEmail: string; label?: string; dailyLimit?: number },
) {
  const email = input.linkedinEmail.toLowerCase().trim();
  if (await LinkedInAccount.exists({ workspaceId: ctx.workspaceId, linkedinEmail: email })) {
    throw conflict("This LinkedIn account is already connected");
  }
  const account = await LinkedInAccount.create({
    workspaceId: ctx.workspaceId,
    linkedinEmail: email,
    label: input.label,
    dailyLimit: await resolveDailyLimit(ctx.workspaceId, input.dailyLimit),
    status: "connecting",
  });
  await ensureBrowserContainer(account);
  await persistSession(account, cookies, "connect_browser");
  return String(account._id);
}

export async function connectAccount(
  ctx: AuthContext,
  input: { linkedinEmail: unknown; linkedinPassword: unknown; dailyLimit?: unknown; label?: unknown },
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
    dailyLimit: await resolveDailyLimit(ctx.workspaceId, input.dailyLimit),
    status: "connecting",
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
    const result = await linkedinActions.verifyCookies(cookies, browserOptions(account));
    valid = Boolean(result.valid);
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
  input: { linkedinPassword?: unknown; dailyLimit?: unknown } = {},
) {
  const account = await findAccount(ctx, id, { withSecrets: true });
  if (input.linkedinPassword) account.linkedinPasswordEncrypted = encrypt(String(input.linkedinPassword));
  if (input.dailyLimit !== undefined) account.dailyLimit = await resolveDailyLimit(ctx.workspaceId, input.dailyLimit);
  if (!account.linkedinPasswordEncrypted) {
    throw badRequest("This account has no stored password. Use browser sign-in to refresh the session.");
  }
  account.status = "connecting";
  await account.save();

  const password = input.linkedinPassword
    ? String(input.linkedinPassword)
    : decrypt(account.linkedinPasswordEncrypted);
  await connectSession(account, password);
  return LinkedInAccount.findById(account._id);
}

export async function startBrowserConnect(
  ctx: AuthContext,
  input: { linkedinEmail: unknown; dailyLimit?: unknown; label?: unknown },
) {
  if (!input.linkedinEmail || !EMAIL_RE.test(String(input.linkedinEmail).trim())) {
    throw badRequest("A valid LinkedIn email is required (used as the account id in Reachly)");
  }
  const linkedinEmail = String(input.linkedinEmail).toLowerCase().trim();
  if (await LinkedInAccount.exists({ workspaceId: ctx.workspaceId, linkedinEmail })) {
    throw conflict("This LinkedIn account is already connected");
  }
  const label = input.label ? String(input.label).trim() : undefined;
  const dailyLimit = await resolveDailyLimit(ctx.workspaceId, input.dailyLimit);

  if (!env.browserConnectEnabled) {
    throw unprocessable(
      "Browser sign-in only works when Reachly runs on your computer (npm run dev). On Render and other cloud hosts, use Email & password to connect LinkedIn.",
    );
  }

  try {
    return await browserConnect.startBrowserConnectSession({
      workspaceId: String(ctx.workspaceId),
      userId: String(ctx.userId),
      onSuccess: (cookies) => createAccountFromBrowserSession(ctx, cookies, { linkedinEmail, label, dailyLimit }),
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "BROWSER_CONNECT_IN_PROGRESS") {
      throw conflict("A browser sign-in is already in progress for this workspace. Finish or cancel it first.");
    }
    console.error("[accounts] browser connect failed:", message);
    throw new AppError(502, CONNECT_LOGIN_FAILED);
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

export async function updateAccount(ctx: AuthContext, id: string, input: { label?: unknown; dailyLimit?: unknown }) {
  const account = await findAccount(ctx, id);
  if (input.label !== undefined) account.label = input.label ? String(input.label).trim() : undefined;
  if (input.dailyLimit !== undefined) account.dailyLimit = await resolveDailyLimit(ctx.workspaceId, input.dailyLimit);
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
