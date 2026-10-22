const DEFAULT_AFTER_AUTH = "/dashboard";

export function getSafeRedirectPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_AFTER_AUTH,
): string {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  if (trimmed.startsWith("/login") || trimmed.startsWith("/signup")) return fallback;
  return trimmed;
}
