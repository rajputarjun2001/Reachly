import { NextResponse } from "next/server";
import { completeLinkedInOAuthConnect } from "@server/domain/linkedinOAuth";
import { isAppError } from "@server/utils/errors";
import { isBackendConfigured } from "@/lib/env";
import { ensureDb } from "@/lib/server/backend";
import { getSession } from "@/lib/auth/session";

function accountsRedirect(request: Request, params: Record<string, string>) {
  const target = new URL("/accounts", request.url);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  if (!isBackendConfigured()) {
    return accountsRedirect(request, { oauth_error: "Backend is not configured." });
  }

  const session = await getSession();
  if (!session?.workspaceId) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", "/accounts");
    return NextResponse.redirect(login);
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    const desc = url.searchParams.get("error_description") || error;
    return accountsRedirect(request, { oauth_error: desc });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return accountsRedirect(request, { oauth_error: "LinkedIn did not return an authorization code." });
  }

  try {
    await ensureDb();
    const result = await completeLinkedInOAuthConnect(code, state);
    return accountsRedirect(request, {
      oauth: "session_required",
      account_id: result.accountId,
    });
  } catch (err) {
    const message = isAppError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : "Could not complete LinkedIn sign-in.";
    return accountsRedirect(request, { oauth_error: message });
  }
}
