import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/env";

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

  const sessionResponse = await updateSession(request);

  if (!isSupabaseConfigured()) {
    return sessionResponse;
  }

  const { createServerClient } = await import("@supabase/ssr");
  const env = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(env, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // refreshed in updateSession
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

  if (user && pathname === "/workspace/setup") {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership?.workspace_id) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  if (user && isProtectedAppRoute(pathname) && pathname !== "/workspace/setup") {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.workspace_id) {
      const url = request.nextUrl.clone();
      url.pathname = "/workspace/setup";
      return NextResponse.redirect(url);
    }
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
