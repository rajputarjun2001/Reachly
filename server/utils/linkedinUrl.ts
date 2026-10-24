/** Canonical form: https://www.linkedin.com/in/<slug> (lowercase, no query, no trailing slash). */
export function normalizeLinkedinUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  path = path.replace(/\/+$/, "").toLowerCase();
  if (!/^\/(in|pub|sales\/lead|sales\/people)\/[^/]+/.test(path)) return null;
  return `https://www.linkedin.com${path}`;
}

export function extractDomain(value: unknown): string | null {
  if (!value || typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@") && !v.includes("/")) return v.split("@").pop() || null;
  try {
    const url = new URL(/^https?:\/\//.test(v) ? v : `https://${v}`);
    return url.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** A blacklisted domain "acme.com" also matches subdomains such as "eu.acme.com". */
export function domainMatches(candidate: string | null, blacklisted: string | null): boolean {
  if (!candidate || !blacklisted) return false;
  return candidate === blacklisted || candidate.endsWith(`.${blacklisted}`);
}
