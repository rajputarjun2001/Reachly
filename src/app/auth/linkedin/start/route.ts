import { NextResponse } from "next/server";
import { beginLinkedInOAuthConnect } from "@server/domain/linkedinOAuth";
import { isBackendConfigured } from "@/lib/env";
import { ensureDb } from "@/lib/server/backend";
import { getSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  if (!isBackendConfigured()) {
    return NextResponse.redirect(new URL("/accounts?oauth_error=Backend+is+not+configured", request.url));
  }

  const session = await getSession();
  if (!session?.workspaceId) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", "/accounts");
    return NextResponse.redirect(login);
  }

  const url = new URL(request.url);
  const label = url.searchParams.get("label") ?? undefined;
  const dailyLimit = url.searchParams.get("daily_limit") ?? undefined;
  const email = url.searchParams.get("email") ?? undefined;

  try {
    await ensureDb();
    const { authorizeUrl } = await beginLinkedInOAuthConnect(
      { userId: session.userId, workspaceId: session.workspaceId, role: session.role },
      { label, dailyLimit, fallbackEmail: email },
    );
    return NextResponse.redirect(authorizeUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start LinkedIn sign-in.";
    return NextResponse.redirect(
      new URL(`/accounts?oauth_error=${encodeURIComponent(message)}`, request.url),
    );
  }
}
