import { env } from "../config/env";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Simple per-process limiter for sign-in and registration (REST + Server Actions). */
export function consumeAuthAttempt(key: string): void {
  if (env.isTest) return;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    throw new Error("Too many attempts. Try again later.");
  }
}

export function clientIpFromForwarded(forwardedFor: string | null | undefined, realIp?: string | null): string {
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  if (realIp?.trim()) return realIp.trim();
  return "unknown";
}