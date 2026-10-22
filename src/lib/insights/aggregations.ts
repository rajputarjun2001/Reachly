import type { CampaignStatus } from "@/lib/campaigns/types";
import type { CampaignStatusCounts, DayCount } from "./types";

export function emptyStatusCounts(): CampaignStatusCounts {
  return { draft: 0, active: 0, paused: 0, archived: 0 };
}

export function tallyStatuses(statuses: CampaignStatus[]): CampaignStatusCounts {
  const counts = emptyStatusCounts();
  for (const s of statuses) {
    if (s in counts) counts[s as CampaignStatus] += 1;
  }
  return counts;
}

/** UTC date keys `YYYY-MM-DD` for the last `days` days including today. */
export function lastNDayKeys(days: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export function bucketCreatedAtByDay(
  timestamps: string[],
  dayKeys: string[],
): DayCount[] {
  const map = new Map(dayKeys.map((k) => [k, 0]));
  for (const ts of timestamps) {
    const key = ts.slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return dayKeys.map((date) => ({ date, count: map.get(date) ?? 0 }));
}

export function formatDayLabel(dateKey: string) {
  try {
    const d = new Date(`${dateKey}T12:00:00Z`);
    return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
  } catch {
    return dateKey;
  }
}
