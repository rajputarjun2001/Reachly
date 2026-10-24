import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession } from "../auth/token";
import { requireWorkspace, type AuthContext } from "../domain/context";
import { unauthorized } from "../utils/errors";

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Accepts `Authorization: Bearer <jwt>` (API clients) or the httpOnly session cookie (browser). */
export function extractToken(req: Request): string | undefined {
  const [scheme, token] = (req.headers.authorization || "").split(" ");
  if (scheme === "Bearer" && token) return token;
  return readCookie(req.headers.cookie, SESSION_COOKIE);
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const claims = await verifySession(extractToken(req));
  if (!claims) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.session = claims;
  next();
}

/** Context for workspace-scoped routes; throws 401 when the user has not created a workspace yet. */
export function ctxOf(req: Request): AuthContext {
  if (!req.session) throw unauthorized("Not authenticated");
  return requireWorkspace(req.session);
}
