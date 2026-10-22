"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WORKSPACE_READY_COOKIE, workspaceReadyCookieOptions } from "@/lib/auth/workspace-cookie";
import { createClientIfConfigured } from "@/lib/supabase/server";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { signUpErrorMessage } from "@/lib/auth/errors";
import { isSupabaseConfigured } from "@/lib/env";

const GENERIC_AUTH_ERROR = "Unable to sign in. Check your email and password.";

export type AuthActionState = {
  error?: string;
  success?: string;
};

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See docs/SETUP.md." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = getSafeRedirectPath(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClientIfConfigured();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: GENERIC_AUTH_ERROR };
  }

  redirect(next);
}

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See docs/SETUP.md." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClientIfConfigured();
  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: signUpErrorMessage(error) };
  }

  if (data.user?.identities?.length === 0) {
    return {
      error:
        "An account with this email may already exist. Try signing in, or use forgot password if you cannot sign in.",
    };
  }

  return {
    success:
      "Check your email to confirm your account, then sign in. If confirmation is disabled in Supabase, you can sign in now.",
  };
}

export async function forgotPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Email is required." };

  const supabase = await createClientIfConfigured();
  if (!supabase) return { error: "Supabase is not configured." };

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`,
  });

  if (error) {
    return { error: "If an account exists for this email, you will receive a reset link shortly." };
  }

  return {
    success: "If an account exists for this email, you will receive a reset link shortly.",
  };
}

export async function resetPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClientIfConfigured();
  if (!supabase) return { error: "Supabase is not configured." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: "Unable to update password. Request a new reset link." };
  }

  redirect("/login?reset=success");
}

export async function createWorkspaceAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const name = String(formData.get("workspaceName") ?? "").trim();
  if (!name) return { error: "Workspace name is required." };

  const supabase = await createClientIfConfigured();
  if (!supabase) return { error: "Supabase is not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_initial_workspace", {
    workspace_name: name,
  });

  if (error) {
    return { error: "Unable to create workspace. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_READY_COOKIE, "1", workspaceReadyCookieOptions);

  redirect("/dashboard");
}
