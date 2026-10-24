import { MAX_STEP_DELAY_DAYS, RETRY_BACKOFF_MS } from "./constants";

export function validateStepDelayDays(delayDays: unknown): number | null {
  if (delayDays === undefined || delayDays === null) return 0;
  if (typeof delayDays !== "number" || !Number.isFinite(delayDays)) return null;
  const whole = Math.floor(delayDays);
  if (whole < 0 || whole > MAX_STEP_DELAY_DAYS) return null;
  return whole;
}

/** UTC instant for executing a step after `delayDays` from `base` (defaults to now). */
export function computeStepScheduledAt(delayDays: number, base: Date = new Date()): Date {
  const ms = base.getTime() + delayDays * 24 * 60 * 60 * 1000;
  return new Date(ms);
}

export function computeNextRetryAt(attemptNumber: number, from: Date = new Date()): Date {
  const index = Math.max(0, Math.min(attemptNumber - 1, RETRY_BACKOFF_MS.length - 1));
  return new Date(from.getTime() + RETRY_BACKOFF_MS[index]);
}

export function buildJobIdempotencyKey(enrollmentId: string, campaignStepId: string): string {
  return `${enrollmentId}:${campaignStepId}`;
}

export function isJobDue(scheduledAt: string, nextRetryAt: string | null, now: Date = new Date()): boolean {
  const scheduled = new Date(scheduledAt).getTime();
  if (scheduled > now.getTime()) return false;
  if (nextRetryAt) {
    return new Date(nextRetryAt).getTime() <= now.getTime();
  }
  return true;
}
