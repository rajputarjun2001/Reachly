import { describe, expect, it } from "vitest";
import {
  bucketCreatedAtByDay,
  lastNDayKeys,
  tallyStatuses,
} from "./aggregations";

describe("insights aggregations", () => {
  it("builds last N day keys in UTC", () => {
    const keys = lastNDayKeys(3, new Date("2026-03-15T12:00:00Z"));
    expect(keys).toHaveLength(3);
    expect(keys[2]).toBe("2026-03-15");
  });

  it("buckets timestamps by day", () => {
    const keys = ["2026-03-13", "2026-03-14", "2026-03-15"];
    const buckets = bucketCreatedAtByDay(
      ["2026-03-14T10:00:00Z", "2026-03-14T18:00:00Z", "2026-03-15T01:00:00Z"],
      keys,
    );
    expect(buckets.find((b) => b.date === "2026-03-14")?.count).toBe(2);
    expect(buckets.find((b) => b.date === "2026-03-13")?.count).toBe(0);
  });

  it("tallies campaign statuses", () => {
    const counts = tallyStatuses(["draft", "active", "active", "archived"]);
    expect(counts.draft).toBe(1);
    expect(counts.active).toBe(2);
    expect(counts.archived).toBe(1);
  });
});
