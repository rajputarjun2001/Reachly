import type { SessionCookie } from "../services/playwright/linkedinActions";
import { badRequest } from "./errors";

const LINKEDIN_DOMAIN = ".linkedin.com";
const LINKEDIN_WWW_DOMAIN = ".www.linkedin.com";

/**
 * LinkedIn scopes its auth cookies to .www.linkedin.com, not .linkedin.com. They must be restored on
 * that exact domain: when LinkedIn rotates or clears one it addresses .www.linkedin.com, so a copy
 * stored on .linkedin.com survives next to the new one. The browser then sends both, and a rejected
 * li_at can never be cleared, which turns "session expired" into ERR_TOO_MANY_REDIRECTS.
 */
const WWW_SCOPED_COOKIES = new Set(["li_at", "JSESSIONID", "bscookie", "li_rm", "li_a"]);
/** Cookies LinkedIn's own page script must read (JSESSIONID is the CSRF token source). */
const SCRIPT_READABLE_COOKIES = new Set(["JSESSIONID"]);

const PASTE_COOKIES_HINT =
  "Paste li_at=…; JSESSIONID=… pairs, or export the full cookie list from DevTools (Application → Cookies → .linkedin.com). A bare li_at value alone is not enough.";

function isLinkedInCookieDomain(domain: string | undefined): boolean {
  const d = String(domain ?? LINKEDIN_DOMAIN)
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
  return d === "linkedin.com" || d.endsWith(".linkedin.com");
}

function cookieDomain(name: string, domain: string | undefined): string {
  if (WWW_SCOPED_COOKIES.has(name)) return LINKEDIN_WWW_DOMAIN;
  const d = String(domain ?? "")
    .trim()
    .toLowerCase();
  // Bare "linkedin.com" would become a host-only cookie that www.linkedin.com never receives.
  if (!d || d === "linkedin.com") return LINKEDIN_DOMAIN;
  return d;
}

/** The browser stores JSESSIONID with literal quotes ("ajax:123"); DevTools copies often drop them. */
function cookieValue(name: string, value: string): string {
  if (name === "JSESSIONID" && /^ajax:/.test(value)) return `"${value}"`;
  return value;
}

/**
 * Prepares cookies for Playwright addCookies / storage: drops non-LinkedIn cookies, puts each cookie on
 * the domain LinkedIn itself uses, and removes duplicates (last one wins). Also repairs sessions that
 * were stored by earlier versions, which flattened every domain to .linkedin.com.
 */
export function normalizeLinkedInCookiesForPlaywright(cookies: SessionCookie[]): SessionCookie[] {
  const byKey = new Map<string, SessionCookie>();
  for (const c of cookies) {
    if (!c.name || !c.value || !isLinkedInCookieDomain(c.domain)) continue;
    const path = String(c.path ?? "/").trim() || "/";
    const domain = cookieDomain(c.name, c.domain);
    const cookie: SessionCookie = { ...c, value: cookieValue(c.name, c.value), domain, path };
    if (SCRIPT_READABLE_COOKIES.has(c.name)) cookie.httpOnly = false;
    const key = `${c.name}|${domain}|${path}`;
    byKey.delete(key);
    byKey.set(key, cookie);
  }
  return [...byKey.values()];
}

function assertRequiredSessionCookies(cookies: SessionCookie[]) {
  if (!cookies.some((c) => c.name === "li_at" && c.value)) {
    throw badRequest("LinkedIn session cookies must include li_at.");
  }
  if (!cookies.some((c) => c.name === "JSESSIONID" && c.value)) {
    throw badRequest(`LinkedIn session cookies must include JSESSIONID. ${PASTE_COOKIES_HINT}`);
  }
}

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
  cookie.domain = domain;
  cookie.path = path;
  if (typeof row.secure === "boolean") cookie.secure = row.secure;
  if (typeof row.httpOnly === "boolean") cookie.httpOnly = row.httpOnly;
  if (typeof row.expires === "number") cookie.expires = row.expires;
  return cookie;
}

function normalizeCookieArray(items: unknown[]): SessionCookie[] {
  const cookies = items.map(normalizeCookie).filter((c): c is SessionCookie => Boolean(c));
  if (!cookies.length) {
    throw badRequest("Could not read any cookies from that JSON. Each entry needs a name and value.");
  }
  assertRequiredSessionCookies(cookies);
  return normalizeLinkedInCookiesForPlaywright(cookies);
}

function parseJsonCookies(text: string): SessionCookie[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw badRequest(`Invalid JSON. ${PASTE_COOKIES_HINT}`);
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
  return normalizeLinkedInCookiesForPlaywright(cookies);
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
    throw badRequest(`A bare li_at token is not supported. ${PASTE_COOKIES_HINT}`);
  }

  throw badRequest(PASTE_COOKIES_HINT);
}
