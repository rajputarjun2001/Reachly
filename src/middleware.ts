import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@server/auth/token";
import { isBackendConfigured } from "@server/config/env";

const AUTH_ROUTES = ["/login", "/signup"];
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/campaigns",
  "/leads",
  "/accounts",
  "/unibox",
  "/analytics",
  "/settings",
  "/workspace/setup",
];

const matches = (pathname: string, routes: string[]) =>
  routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));

function redirectTo(request: NextRequest, pathname: string, next?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

/** Cheap edge check of the signed session cookie; pages re-validate against the database. */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isBackendConfigured()) return NextResponse.next();

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (matches(pathname, PROTECTED_PREFIXES)) {
      const response = redirectTo(request, "/login", pathname);
      if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    return NextResponse.next();
  }

  if (matches(pathname, AUTH_ROUTES)) {
    return redirectTo(request, session.workspaceId ? "/dashboard" : "/workspace/setup");
  }
  if (!session.workspaceId && matches(pathname, PROTECTED_PREFIXES) && pathname !== "/workspace/setup") {
    return redirectTo(request, "/workspace/setup");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
