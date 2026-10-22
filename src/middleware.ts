import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { WORKSPACE_READY_COOKIE, workspaceReadyCookieOptions } from "@/lib/auth/workspace-cookie";
import { getSupabasePublicEnv, isSupabaseConfigured } from "@/lib/env";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];
const PUBLIC_PREFIXES = ["/auth/", "/setup"];

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

function isPublicRoute(pathname: string) {
  if (pathname === "/setup") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isProtectedAppRoute(pathname: string) {
  const protectedPrefixes = [
    "/dashboard",
    "/campaigns",
    "/leads",
    "/accounts",
    "/unibox",
    "/analytics",
    "/settings",
    "/workspace/setup",
  ];
  return protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return response;
  }

  const env = getSupabasePublicEnv()!;

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isAuthRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (!user && isProtectedAppRoute(pathname) && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const hasWorkspaceCookie = request.cookies.get(WORKSPACE_READY_COOKIE)?.value === "1";

  async function userHasWorkspace(): Promise<boolean> {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user!.id)
      .limit(1)
      .maybeSingle();
    return Boolean(membership?.workspace_id);
  }

  if (user && pathname === "/workspace/setup") {
    if (hasWorkspaceCookie || (await userHasWorkspace())) {
      response.cookies.set(WORKSPACE_READY_COOKIE, "1", workspaceReadyCookieOptions);
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (user && isProtectedAppRoute(pathname) && pathname !== "/workspace/setup") {
    let hasWorkspace = hasWorkspaceCookie;
    if (!hasWorkspace) {
      hasWorkspace = await userHasWorkspace();
      if (hasWorkspace) {
        response.cookies.set(WORKSPACE_READY_COOKIE, "1", workspaceReadyCookieOptions);
      }
    }

    if (!hasWorkspace) {
      response.cookies.delete(WORKSPACE_READY_COOKIE);
      const url = request.nextUrl.clone();
      url.pathname = "/workspace/setup";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
