"use server";

import { redirect } from "next/navigation";
import * as authDomain from "@server/domain/auth";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { getSession, setSessionCookie } from "@/lib/auth/session";
import { getBackendConfigError } from "@/lib/env";
import { actionErrorMessage, ensureDb } from "@/lib/server/backend";

const GENERIC_AUTH_ERROR = "Unable to sign in. Check your email and password.";

export type AuthActionState = {
  error?: string;
  success?: string;
};

function configError(): AuthActionState | null {
  const message = getBackendConfigError();
  return message ? { error: `Backend is not configured. ${message} See docs/SETUP.md.` } : null;
}

export async function signInAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const notConfigured = configError();
  if (notConfigured) return notConfigured;

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = getSafeRedirectPath(String(formData.get("next") ?? ""));
  if (!email || !password) return { error: "Email and password are required." };

  let destination = next;
  try {
    await ensureDb();
    const user = await authDomain.authenticate(email, password);
    await setSessionCookie(await authDomain.issueToken(user));
    if (!user.workspaceId) destination = "/workspace/setup";
  } catch (err) {
    const message = actionErrorMessage(err, GENERIC_AUTH_ERROR);
    return { error: message === "Invalid email or password" ? GENERIC_AUTH_ERROR : message };
  }
  redirect(destination);
}

export async function signUpAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const notConfigured = configError();
  if (notConfigured) return notConfigured;

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("displayName") ?? "").trim();
  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    await ensureDb();
    const user = await authDomain.registerUser({ email, password, fullName });
    await setSessionCookie(await authDomain.issueToken(user));
  } catch (err) {
    return { error: actionErrorMessage(err, "Unable to create account. Please try again.") };
  }
  redirect("/workspace/setup");
}

export async function createWorkspaceAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const notConfigured = configError();
  if (notConfigured) return notConfigured;

  const name = String(formData.get("workspaceName") ?? "").trim();
  if (!name) return { error: "Workspace name is required." };

  const session = await getSession();
  if (!session) redirect("/login");

  try {
    await ensureDb();
    const { user } = await authDomain.createWorkspaceForUser(session.userId, { name });
    await setSessionCookie(await authDomain.issueToken(user));
  } catch (err) {
    return { error: actionErrorMessage(err, "Unable to create workspace. Please try again.") };
  }
  redirect("/dashboard");
}

export async function acceptInviteAction(_prev: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const notConfigured = configError();
  if (notConfigured) return notConfigured;

  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("displayName") ?? "").trim();
  if (!token) return { error: "This invite link is incomplete. Ask the workspace owner for a new one." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    await ensureDb();
    const { user } = await authDomain.acceptInvite({ token, password, fullName });
    await setSessionCookie(await authDomain.issueToken(user));
  } catch (err) {
    return { error: actionErrorMessage(err, "Unable to accept the invite.") };
  }
  redirect("/dashboard");
}
