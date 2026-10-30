import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { User, Workspace } from "@server/models";
import { issueToken } from "@server/domain/auth";
import type { AuthContext } from "@server/domain/context";
import { getCurrentUser, getSession, setSessionCookie } from "@/lib/auth/session";
import { ensureDb } from "@/lib/server/backend";

export type WorkspaceRole = "owner" | "member";

export type WorkspaceContext = {
  userId: string;
  email: string | undefined;
  fullName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspacePlan: string;
  role: WorkspaceRole;
};

export class WorkspaceContextError extends Error {
  constructor() {
    super("Workspace context unavailable");
    this.name = "WorkspaceContextError";
  }
}

/** Resolved from the verified session cookie plus the database (membership can change after login). */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const user = await getCurrentUser();
  if (!user?.workspaceId) return null;
  const workspace = await Workspace.findById(user.workspaceId).lean();
  if (!workspace) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    workspaceId: String(workspace._id),
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug ?? "",
    workspacePlan: workspace.plan ?? "starter",
    role: user.role,
  };
});

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new WorkspaceContextError();
  return ctx;
}

/** Context passed to server/domain services. */
export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await requireWorkspaceContext();
  return { userId: ctx.userId, workspaceId: ctx.workspaceId, role: ctx.role };
}

/** Drop orphan workspace ids (e.g. after switching to an empty local database) and refresh the JWT. */
async function syncStaleWorkspaceSession(userId: string): Promise<void> {
  await ensureDb();
  const user = await User.findById(userId);
  if (!user?.workspaceId) return;
  const workspace = await Workspace.findById(user.workspaceId);
  if (workspace) return;
  user.workspaceId = null;
  await user.save();
  await setSessionCookie(await issueToken(user));
}

/** For pages: sends the visitor to login, workspace setup, or clears a stale session. */
export async function redirectWithoutWorkspace(nextPath: string): Promise<never> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const user = await getCurrentUser();
  if (!user) redirect("/auth/signout");
  if (!user.workspaceId) redirect("/workspace/setup");
  await syncStaleWorkspaceSession(user.id);
  redirect("/workspace/setup");
}
