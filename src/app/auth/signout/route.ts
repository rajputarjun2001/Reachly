import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@server/auth/token";

function signOut(_request: Request) {
  // Relative URL so the browser stays on the public origin (request.url is often localhost behind a proxy).
  const response = NextResponse.redirect("/login", { status: 303 });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export async function POST(request: Request) {
  return signOut(request);
}

/** Used by server components to clear a session whose user or workspace no longer exists. */
export async function GET(request: Request) {
  return signOut(request);
}
