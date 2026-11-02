import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifySession,
  type SessionClaims,
} from "@server/auth/token";
import { User } from "@server/models";
import { isBackendConfigured } from "@/lib/env";
import { ensureDb } from "@/lib/server/backend";

/** Secure cookies require HTTPS; plain HTTP deploys (e.g. GCP without TLS) must not set Secure. */
function sessionCookieSecure(): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return site.startsWith("https://");
}

export const getSession = cache(async (): Promise<SessionClaims | null> => {
  if (!isBackendConfigured()) return null;
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
});

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieSecure(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  timezone: string;
  workspaceId: string | null;
  role: "owner" | "member";
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  await ensureDb();
  const user = await User.findById(session.userId).lean();
  if (!user || user.status !== "active") return null;
  return {
    id: String(user._id),
    email: user.email,
    fullName: user.fullName ?? "",
    timezone: user.timezone ?? "UTC",
    workspaceId: user.workspaceId ? String(user.workspaceId) : null,
    role: user.role === "owner" ? "owner" : "member",
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
