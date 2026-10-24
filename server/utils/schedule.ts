export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export type SendingWindow = {
  sendingWindowStart: number;
  sendingWindowEnd: number;
  sendOnWeekends: boolean;
  timezone?: string | null;
};

type ZonedParts = { minutes: number; weekday: number; key: string };

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

export function zonedParts(date: Date, timezone?: string | null): ZonedParts {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = Object.fromEntries(formatterFor(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0,
    key: `${parts.year}${parts.month}${parts.day}`,
  };
}

export function isWeekend(date: Date, timezone?: string | null): boolean {
  const d = zonedParts(date, timezone).weekday;
  return d === 0 || d === 6;
}

/** Calendar day (YYYYMMDD) in the given timezone. */
export function dateKey(now = new Date(), timezone?: string | null): string {
  return zonedParts(now, timezone).key;
}

/**
 * Random send times inside the remaining part of today's window (in `timezone`).
 * Returns delays in minutes from `now`, sorted ascending. Empty if the window has closed.
 */
export function generateRandomSlots(
  startHour: number,
  endHour: number,
  count: number,
  now = new Date(),
  timezone?: string | null,
): number[] {
  const nowMin = zonedParts(now, timezone).minutes;
  const startMin = Math.max(startHour * 60, nowMin);
  const endMin = endHour * 60;
  if (count <= 0 || endMin <= startMin) return [];
  const slots: number[] = [];
  for (let i = 0; i < count; i += 1) {
    slots.push(Math.floor(Math.random() * (endMin - startMin)) + startMin);
  }
  return slots.sort((a, b) => a - b).map((m) => Math.max(0, m - nowMin));
}

export function isWithinSendingWindow(window: SendingWindow, now = new Date()): boolean {
  const { minutes, weekday } = zonedParts(now, window.timezone);
  if (!window.sendOnWeekends && (weekday === 0 || weekday === 6)) return false;
  return minutes >= window.sendingWindowStart * 60 && minutes < window.sendingWindowEnd * 60;
}

/** True while today's window (in the window's timezone) has not ended yet. */
export function windowStillOpenToday(window: SendingWindow, now = new Date()): boolean {
  const { minutes, weekday } = zonedParts(now, window.timezone);
  if (!window.sendOnWeekends && (weekday === 0 || weekday === 6)) return false;
  return minutes < window.sendingWindowEnd * 60;
}

const SCAN_STEP = 5 * MINUTE;

/** Milliseconds from `now` until the next moment sending is allowed (0 if allowed now). */
export function msUntilNextWindow(window: SendingWindow, now = new Date()): number {
  if (isWithinSendingWindow(window, now)) return 0;
  const first = Math.ceil(now.getTime() / SCAN_STEP) * SCAN_STEP;
  for (let t = first; t <= now.getTime() + 8 * DAY; t += SCAN_STEP) {
    if (isWithinSendingWindow(window, new Date(t))) return t - now.getTime();
  }
  return DAY;
}
