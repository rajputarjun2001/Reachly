import "server-only";

import * as authDomain from "@server/domain/auth";
import * as blacklistDomain from "@server/domain/blacklist";
import * as settingsDomain from "@server/domain/settings";
import { PLAN_DAILY_LIMIT, type UserDoc } from "@server/models";
import { ensureDb } from "@/lib/server/backend";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { requireAuthContext } from "@/lib/workspace/context";
import type { BlacklistEntryView, MemberView, SettingsData } from "./types";

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function mapMember(user: UserDoc): MemberView {
  return {
    id: String(user._id),
    email: user.email,
    full_name: user.fullName ?? "",
    role: user.role === "owner" ? "owner" : "member",
    status: user.status === "pending" ? "pending" : "active",
    last_active_at: iso(user.lastActiveAt),
    invite_expires_at: iso(user.inviteExpiresAt),
  };
}

export async function loadSettingsData(): Promise<SettingsData> {
  const user = await requireUser();
  const ctx = await requireAuthContext();
  await ensureDb();

  const [workspace, members, blacklist] = await Promise.all([
    settingsDomain.getWorkspace(ctx),
    authDomain.listMembers(ctx),
    blacklistDomain.listEntries(ctx, { limit: 100 }),
  ]);

  const plan = (workspace.plan as keyof typeof PLAN_DAILY_LIMIT) || "starter";

  return {
    profile: {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      timezone: user.timezone,
      role: user.role,
    },
    workspace: {
      id: String(workspace._id),
      name: workspace.name,
      plan,
      plan_daily_cap: PLAN_DAILY_LIMIT[plan],
      daily_limit_per_account: workspace.dailyLimitPerAccount ?? 10,
      sending_window_start: workspace.sendingWindowStart ?? 8,
      sending_window_end: workspace.sendingWindowEnd ?? 20,
      send_on_weekends: Boolean(workspace.sendOnWeekends),
      timezone: workspace.timezone ?? "UTC",
    },
    members: members.map(mapMember),
    blacklist: blacklist.entries.map((e) => ({
      id: String(e._id),
      type: e.type as BlacklistEntryView["type"],
      value: e.value,
      created_at: iso(e.get("createdAt") as Date) ?? new Date().toISOString(),
    })),
  };
}

export async function updateProfileSettings(input: { fullName?: string; timezone?: string }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  await ensureDb();
  await authDomain.updateProfile({ userId: user.id }, input);
}

export async function updateWorkspaceSettings(input: {
  name?: string;
  dailyLimitPerAccount?: number;
  sendingWindowStart?: number;
  sendingWindowEnd?: number;
  sendOnWeekends?: boolean;
  timezone?: string;
}) {
  const ctx = await requireAuthContext();
  await ensureDb();
  await settingsDomain.updateWorkspace(ctx, {
    name: input.name,
    dailyLimitPerAccount: input.dailyLimitPerAccount,
    sendingWindowStart: input.sendingWindowStart,
    sendingWindowEnd: input.sendingWindowEnd,
    sendOnWeekends: input.sendOnWeekends,
    timezone: input.timezone,
  });
}

export async function changeUserPassword(oldPassword: string, newPassword: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  await ensureDb();
  await authDomain.changePassword({ userId: user.id }, { oldPassword, newPassword });
}

export async function inviteWorkspaceMember(email: string, fullName?: string) {
  const ctx = await requireAuthContext();
  await ensureDb();
  const { inviteToken } = await authDomain.inviteMember(ctx, { email, fullName });
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return { inviteUrl: `${base}/invite?token=${encodeURIComponent(inviteToken)}` };
}

export async function removeWorkspaceMember(userId: string) {
  const ctx = await requireAuthContext();
  await ensureDb();
  await authDomain.removeMember(ctx, userId);
}

export async function addBlacklistEntry(type: "domain" | "profile_url", value: string) {
  const ctx = await requireAuthContext();
  await ensureDb();
  await blacklistDomain.addEntry(ctx, { type, value });
}

export async function removeBlacklistEntry(id: string) {
  const ctx = await requireAuthContext();
  await ensureDb();
  await blacklistDomain.removeEntry(ctx, id);
}
