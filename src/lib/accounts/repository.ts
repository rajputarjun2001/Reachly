import "server-only";

import * as accountsDomain from "@server/domain/accounts";
import type { LinkedInAccountDoc } from "@server/models";
import { dateKey } from "@server/utils/schedule";
import { ensureDb } from "@/lib/server/backend";
import { requireAuthContext } from "@/lib/workspace/context";
import { getWorkspace } from "@server/domain/settings";
import type { AccountHealth, AccountStatus, LinkedInAccountView } from "./types";

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
}): Promise<LinkedInAccountView | null> {
  const { ctx, todayKey } = await scoped();
  const doc = await accountsDomain.connectAccount(ctx, {
    linkedinEmail: input.email,
    linkedinPassword: input.password,
    label: input.label,
    dailyLimit: input.dailyLimit,
  });
  return doc ? mapAccount(doc, todayKey) : null;
}

export async function connectAccountWithSessionCookies(input: {
  email: string;
  sessionCookies: string;
  label?: string;
  dailyLimit?: number;
}): Promise<LinkedInAccountView | null> {
  const { ctx, todayKey } = await scoped();
  const doc = await accountsDomain.connectAccountWithSessionCookies(ctx, {
    linkedinEmail: input.email,
    sessionCookies: input.sessionCookies,
    label: input.label,
    dailyLimit: input.dailyLimit,
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

export async function updateAccount(id: string, input: { label?: string; dailyLimit?: number }): Promise<void> {
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
  error?: string;
  accountId?: string;
};

export async function startBrowserConnect(input: {
  email: string;
  label?: string;
  dailyLimit?: number;
}): Promise<BrowserConnectState> {
  const { ctx } = await scoped();
  return accountsDomain.startBrowserConnect(ctx, {
    linkedinEmail: input.email,
    label: input.label,
    dailyLimit: input.dailyLimit,
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
