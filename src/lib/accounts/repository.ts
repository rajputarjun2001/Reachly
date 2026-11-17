import "server-only";

import * as accountsDomain from "@server/domain/accounts";
import type { LinkedInAccountDoc } from "@server/models";
import { dateKey } from "@server/utils/schedule";
import { ensureDb } from "@/lib/server/backend";
import { requireAuthContext } from "@/lib/workspace/context";
import { getWorkspace } from "@server/domain/settings";
import { isAppError } from "@server/utils/errors";
import type { AccountHealth, AccountStatus, AccountVerification, LinkedInAccountView } from "./types";

/**
 * When a sign-in failed only because LinkedIn wants the owner to verify it (or rejected the code they
 * typed), returns what the UI needs to ask for the code. Null for every other error.
 */
export function verificationFromError(err: unknown): AccountVerification | null {
  if (!isAppError(err) || !err.details) return null;
  if (err.code !== accountsDomain.VERIFICATION_REQUIRED && err.code !== "INVALID_CODE") return null;
  const d = err.details as Partial<AccountVerification>;
  if (!d.accountId) return null;
  return {
    accountId: String(d.accountId),
    kind: d.kind === "app" ? "app" : "code",
    channel: d.channel ?? "unknown",
    hint: d.hint ?? "",
    message: err.message,
  };
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapAccount(doc: LinkedInAccountDoc, todayKey: string): LinkedInAccountView {
  const sentToday = doc.todayCountDate === todayKey ? doc.todaySentCount ?? 0 : 0;
  return {
    id: String(doc._id),
    label: doc.label ?? null,
    display_name: doc.label || doc.fullName || doc.linkedinEmail,
    linkedin_email: doc.linkedinEmail,
    full_name: doc.fullName ?? null,
    headline: doc.headline ?? null,
    profile_url: doc.profileUrl ?? null,
    status: doc.status as AccountStatus,
    flag_reason: doc.flagReason ?? null,
    identity_verified: Boolean(doc.linkedinSub),
    outreach_ready: doc.status === "active",
    proxy_host: doc.proxyHost ?? null,
    daily_limit: doc.dailyLimit ?? 10,
    today_sent_count: sentToday,
    last_health_check: iso(doc.lastHealthCheck),
    last_sent_at: iso(doc.lastSentAt),
    created_at: iso(doc.get("createdAt") as Date) ?? new Date().toISOString(),
  };
}

async function scoped() {
  const ctx = await requireAuthContext();
  await ensureDb();
  const workspace = await getWorkspace(ctx);
  return { ctx, todayKey: dateKey(new Date(), workspace.timezone || "UTC") };
}

export async function listAccounts(): Promise<LinkedInAccountView[]> {
  const { ctx, todayKey } = await scoped();
  const docs = await accountsDomain.listAccounts(ctx);
  return docs.map((d) => mapAccount(d, todayKey));
}

export async function workspaceAccountCap(): Promise<number> {
  const { ctx } = await scoped();
  return accountsDomain.workspaceDailyCap(ctx.workspaceId);
}

export async function connectAccount(input: {
  email: string;
  password: string;
  label?: string;
  dailyLimit?: number;
  proxyUrl?: string;
}): Promise<LinkedInAccountView | null> {
  const { ctx, todayKey } = await scoped();
  const doc = await accountsDomain.connectAccount(ctx, {
    linkedinEmail: input.email,
    linkedinPassword: input.password,
    label: input.label,
    dailyLimit: input.dailyLimit,
    proxyUrl: input.proxyUrl,
  });
  return doc ? mapAccount(doc, todayKey) : null;
}

export async function connectAccountWithSessionCookies(input: {
  email: string;
  sessionCookies: string;
  label?: string;
  dailyLimit?: number;
  proxyUrl?: string;
}): Promise<LinkedInAccountView | null> {
  const { ctx, todayKey } = await scoped();
  const doc = await accountsDomain.connectAccountWithSessionCookies(ctx, {
    linkedinEmail: input.email,
    sessionCookies: input.sessionCookies,
    label: input.label,
    dailyLimit: input.dailyLimit,
    proxyUrl: input.proxyUrl,
  });
  return doc ? mapAccount(doc, todayKey) : null;
}

export async function reconnectAccount(
  id: string,
  input?: { password?: string; sessionCookies?: string },
): Promise<void> {
  const { ctx } = await scoped();
  await accountsDomain.reconnectAccount(ctx, id, {
    linkedinPassword: input?.password || undefined,
    sessionCookies: input?.sessionCookies,
  });
}

/** Submits the verification code (or, for app approval, re-checks) for a sign-in that is waiting on the owner. */
export async function verifyAccount(id: string, code?: string): Promise<void> {
  const { ctx } = await scoped();
  await accountsDomain.verifyAccountLogin(ctx, id, { code });
}

export async function checkAccount(id: string): Promise<AccountHealth> {
  const { ctx } = await scoped();
  const result = await accountsDomain.accountStatus(ctx, id);
  return {
    status: result.status as AccountStatus,
    valid: result.valid,
    today_sent_count: result.todaySentCount ?? 0,
    daily_limit: result.dailyLimit ?? 10,
  };
}

/** `proxyUrl`: undefined keeps the current proxy, "" removes it. */
export async function updateAccount(
  id: string,
  input: { label?: string; dailyLimit?: number; proxyUrl?: string },
): Promise<void> {
  const { ctx } = await scoped();
  await accountsDomain.updateAccount(ctx, id, input);
}

export async function removeAccount(id: string): Promise<void> {
  const { ctx } = await scoped();
  await accountsDomain.removeAccount(ctx, id);
}

export type BrowserConnectState = {
  sessionId: string;
  status: "pending" | "success" | "failed" | "cancelled";
  /** "window": a Chromium window on the server machine. "remote": streamed into the page. */
  mode: "window" | "remote";
  /** Signed in; the session is being verified and saved. */
  saving?: boolean;
  error?: string;
  accountId?: string;
};

export async function startBrowserConnect(input: {
  email: string;
  label?: string;
  dailyLimit?: number;
  proxyUrl?: string;
}): Promise<BrowserConnectState> {
  const { ctx } = await scoped();
  return accountsDomain.startBrowserConnect(ctx, {
    linkedinEmail: input.email,
    label: input.label,
    dailyLimit: input.dailyLimit,
    proxyUrl: input.proxyUrl,
  });
}

export async function pollBrowserConnect(sessionId: string): Promise<BrowserConnectState> {
  const { ctx } = await scoped();
  return accountsDomain.browserConnectStatus(ctx, sessionId);
}

export async function cancelBrowserConnect(sessionId: string): Promise<void> {
  const { ctx } = await scoped();
  await accountsDomain.cancelBrowserConnect(ctx, sessionId);
}
