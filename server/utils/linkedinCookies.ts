import type { SessionCookie } from "../services/playwright/linkedinActions";
import { badRequest } from "./errors";

const LINKEDIN_DOMAIN = ".linkedin.com";

function linkedInCookie(name: string, value: string): SessionCookie {
  return {
    name,
    value,
    domain: LINKEDIN_DOMAIN,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "None",
    expires: -1,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeCookie(raw: unknown): SessionCookie | null {
  const row = asRecord(raw);
  if (!row) return null;
  const name = String(row.name ?? "").trim();
  const value = String(row.value ?? "").trim();
  if (!name || !value) return null;
  const domain = String(row.domain ?? LINKEDIN_DOMAIN).trim() || LINKEDIN_DOMAIN;
  const path = String(row.path ?? "/").trim() || "/";
  const cookie: SessionCookie = linkedInCookie(name, value);
  cookie.domain = domain.startsWith(".") ? domain : domain.includes("linkedin.com") ? LINKEDIN_DOMAIN : domain;
  cookie.path = path;
  if (typeof row.secure === "boolean") cookie.secure = row.secure;
  if (row.httpOnly === true) cookie.httpOnly = true;
  if (typeof row.expires === "number") cookie.expires = row.expires;
  return cookie;
}

function normalizeCookieArray(items: unknown[]): SessionCookie[] {
  const cookies = items.map(normalizeCookie).filter((c): c is SessionCookie => Boolean(c));
  if (!cookies.length) {
    throw badRequest("Could not read any cookies from that JSON. Each entry needs a name and value.");
  }
  if (!cookies.some((c) => c.name === "li_at" && c.value)) {
    throw badRequest("LinkedIn session cookies must include li_at.");
  }
  return cookies;
}

function parseJsonCookies(text: string): SessionCookie[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest("Invalid JSON. Paste li_at or a cookie array exported from DevTools.");
  }
  if (Array.isArray(parsed)) return normalizeCookieArray(parsed);
  const root = asRecord(parsed);
  if (root?.cookies && Array.isArray(root.cookies)) return normalizeCookieArray(root.cookies);
  if (root && "name" in root) {
    const one = normalizeCookie(root);
    if (!one) throw badRequest("Could not read the cookie object.");
    return normalizeCookieArray([one]);
  }
  throw badRequest("Expected a JSON array of cookies or an object with a cookies array.");
}

function parseNameValuePairs(text: string): SessionCookie[] | null {
  if (!text.includes("=")) return null;
  const cookies: SessionCookie[] = [];
  for (const part of text.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name && value) cookies.push(linkedInCookie(name, value));
  }
  if (!cookies.some((c) => c.name === "li_at")) return null;
  return cookies;
}

/** Parses pasted li_at, Cookie header-style pairs, or JSON cookie exports into Playwright cookies. */
export function parseLinkedInSessionCookies(raw: unknown): SessionCookie[] {
  const text = String(raw ?? "").trim();
  if (!text) throw badRequest("Session cookies are required.");

  if (text.startsWith("[") || text.startsWith("{")) {
    return parseJsonCookies(text);
  }

  const pairs = parseNameValuePairs(text);
  if (pairs) return pairs;

  if (!/\s/.test(text) && text.length >= 20) {
    return normalizeCookieArray([linkedInCookie("li_at", text)]);
  }

  throw badRequest(
    "Paste your li_at cookie value, li_at=… pairs, or a JSON cookie export from DevTools (Application → Cookies → linkedin.com).",
  );
}
