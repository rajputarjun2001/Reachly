import { describe, expect, it } from "vitest";
import { decrypt, decryptJSON, encrypt, encryptJSON, isEncrypted } from "../utils/encryption";
import { domainMatches, extractDomain, normalizeLinkedinUrl } from "../utils/linkedinUrl";
import { parseLeadsCsv } from "../utils/csvParser";
import {
  HOUR,
  dateKey,
  generateRandomSlots,
  isValidTimezone,
  isWithinSendingWindow,
  msUntilNextWindow,
  windowStillOpenToday,
  zonedParts,
} from "../utils/schedule";
import { renderTemplate } from "../utils/template";
import { isBlacklisted } from "../utils/blacklist";
import { getBackendConfigError } from "../config/env";

describe("encryption (AES-256-GCM)", () => {
  it("round-trips text and produces a different ciphertext each time", () => {
    const a = encrypt("s3cret");
    const b = encrypt("s3cret");
    expect(a).not.toEqual(b);
    expect(isEncrypted(a)).toBe(true);
    expect(decrypt(a)).toBe("s3cret");
  });

  it("round-trips JSON", () => {
    const cookies = [{ name: "li_at", value: "x" }];
    expect(decryptJSON(encryptJSON(cookies))).toEqual(cookies);
  });

  it("detects tampering via the auth tag", () => {
    const enc = encrypt("hello");
    const parts = enc.split(":");
    const ct = Buffer.from(parts[4], "base64");
    ct[0] ^= 0xff;
    parts[4] = ct.toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("rejects non-encrypted input and bad keys", () => {
    expect(() => decrypt("plain")).toThrow("not an encrypted payload");
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "short";
    try {
      expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY");
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
  });
});

describe("backend config validation", () => {
  it("requires JWT_SECRET and a 64-hex ENCRYPTION_KEY", () => {
    expect(getBackendConfigError()).toBeNull();
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "zz";
    try {
      expect(getBackendConfigError()).toContain("ENCRYPTION_KEY");
    } finally {
      process.env.ENCRYPTION_KEY = original;
    }
    const secret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "";
    try {
      expect(getBackendConfigError()).toContain("JWT_SECRET");
    } finally {
      process.env.JWT_SECRET = secret;
    }
  });
});

describe("linkedinUrl", () => {
  it.each([
    ["https://www.linkedin.com/in/Jane-Doe/", "https://www.linkedin.com/in/jane-doe"],
    ["linkedin.com/in/jane?trk=abc", "https://www.linkedin.com/in/jane"],
    ["http://uk.linkedin.com/in/jane", "https://www.linkedin.com/in/jane"],
    ["https://example.com/in/jane", null],
    ["https://www.linkedin.com/company/acme", null],
    ["", null],
  ])("normalize(%s) = %s", (input, expected) => {
    expect(normalizeLinkedinUrl(input)).toBe(expected);
  });

  it("extractDomain handles emails, URLs and bare domains", () => {
    expect(extractDomain("jane@Acme.com")).toBe("acme.com");
    expect(extractDomain("https://www.acme.com/about")).toBe("acme.com");
    expect(extractDomain("acme.io")).toBe("acme.io");
    expect(extractDomain("")).toBeNull();
  });

  it("domainMatches includes subdomains only", () => {
    expect(domainMatches("eu.acme.com", "acme.com")).toBe(true);
    expect(domainMatches("acme.com", "acme.com")).toBe(true);
    expect(domainMatches("notacme.com", "acme.com")).toBe(false);
  });
});

describe("csvParser", () => {
  it("parses rows, normalises headers and aliases", () => {
    const csv =
      "\uFEFFLinkedIn URL,First Name,last_name,Company,Job Title,email\nhttps://linkedin.com/in/a,A,B,Acme,CEO,a@acme.com\n";
    expect(parseLeadsCsv(Buffer.from(csv))).toEqual([
      {
        linkedin_url: "https://linkedin.com/in/a",
        first_name: "A",
        last_name: "B",
        company: "Acme",
        title: "CEO",
        email: "a@acme.com",
      },
    ]);
  });

  it("requires a linkedin_url column", () => {
    expect(() => parseLeadsCsv(Buffer.from("name\nx\n"))).toThrow("linkedin_url");
  });

  it("rejects empty and malformed files with 422", () => {
    expect(() => parseLeadsCsv(Buffer.from(""))).toThrow(expect.objectContaining({ status: 422 }));
    expect(() => parseLeadsCsv(Buffer.from("linkedin_url\n"))).toThrow("no data rows");
    expect(() => parseLeadsCsv(Buffer.from('linkedin_url,a\n"unterminated,1\n'))).toThrow(
      expect.objectContaining({ status: 422 }),
    );
  });
});

describe("schedule (timezone-aware)", () => {
  // 2026-10-21 is a Wednesday.
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 21, h, m, 0, 0));
  const ws = { sendingWindowStart: 8, sendingWindowEnd: 20, sendOnWeekends: false, timezone: "UTC" };

  it("generateRandomSlots stays inside the remaining window and is sorted", () => {
    const slots = generateRandomSlots(8, 20, 50, at(10), "UTC");
    expect(slots).toHaveLength(50);
    expect([...slots].sort((a, b) => a - b)).toEqual(slots);
    for (const s of slots) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(10 * 60);
    }
  });

  it("generateRandomSlots before the window starts delays until the window", () => {
    const slots = generateRandomSlots(8, 20, 20, at(6), "UTC");
    expect(slots).toHaveLength(20);
    for (const s of slots) expect(s).toBeGreaterThanOrEqual(120);
  });

  it("generateRandomSlots returns nothing after the window closes or for zero count", () => {
    expect(generateRandomSlots(8, 20, 5, at(21), "UTC")).toEqual([]);
    expect(generateRandomSlots(8, 20, 0, at(9), "UTC")).toEqual([]);
  });

  it("generateRandomSlots evaluates the window in the given timezone", () => {
    // 21:00 UTC is 02:30 next day in Kolkata: the whole 08-20 window is still ahead (5h30m+ away).
    const slots = generateRandomSlots(8, 20, 10, at(21), "Asia/Kolkata");
    expect(slots).toHaveLength(10);
    for (const s of slots) {
      expect(s).toBeGreaterThanOrEqual(5 * 60 + 30);
      expect(s).toBeLessThan(17 * 60 + 30);
    }
  });

  it("isWithinSendingWindow respects hours and weekends", () => {
    expect(isWithinSendingWindow(ws, at(9))).toBe(true);
    expect(isWithinSendingWindow(ws, at(20))).toBe(false);
    const saturday = new Date(Date.UTC(2026, 9, 24, 10));
    expect(isWithinSendingWindow(ws, saturday)).toBe(false);
    expect(isWithinSendingWindow({ ...ws, sendOnWeekends: true }, saturday)).toBe(true);
  });

  it("a non-UTC timezone shifts the window (Asia/Kolkata is UTC+5:30)", () => {
    const kolkata = { ...ws, timezone: "Asia/Kolkata" };
    // 03:00 UTC = 08:30 IST -> open in Kolkata, closed in UTC.
    expect(isWithinSendingWindow(kolkata, at(3))).toBe(true);
    expect(isWithinSendingWindow(ws, at(3))).toBe(false);
    // 15:00 UTC = 20:30 IST -> closed in Kolkata, open in UTC.
    expect(isWithinSendingWindow(kolkata, at(15))).toBe(false);
    expect(isWithinSendingWindow(ws, at(15))).toBe(true);
    // Friday 20:00 UTC is already Saturday 01:30 in Kolkata.
    const friLate = new Date(Date.UTC(2026, 9, 23, 20));
    expect(zonedParts(friLate, "Asia/Kolkata").weekday).toBe(6);
    expect(dateKey(friLate, "Asia/Kolkata")).toBe("20261024");
    expect(dateKey(friLate, "UTC")).toBe("20261023");
  });

  it("msUntilNextWindow finds the next allowed start, skipping weekends", () => {
    expect(msUntilNextWindow(ws, at(9))).toBe(0);
    expect(msUntilNextWindow(ws, at(7))).toBe(HOUR);
    const fridayNight = new Date(Date.UTC(2026, 9, 23, 21));
    const nextMonday8 = new Date(Date.UTC(2026, 9, 26, 8));
    expect(msUntilNextWindow(ws, fridayNight)).toBe(nextMonday8.getTime() - fridayNight.getTime());
    // In Kolkata, 08:00 IST is 02:30 UTC.
    expect(msUntilNextWindow({ ...ws, timezone: "Asia/Kolkata" }, at(1))).toBe(1.5 * HOUR);
  });

  it("windowStillOpenToday is false after the end and on skipped weekends", () => {
    expect(windowStillOpenToday(ws, at(6))).toBe(true);
    expect(windowStillOpenToday(ws, at(19, 59))).toBe(true);
    expect(windowStillOpenToday(ws, at(20))).toBe(false);
    expect(windowStillOpenToday(ws, new Date(Date.UTC(2026, 9, 24, 9)))).toBe(false);
    expect(windowStillOpenToday({ ...ws, timezone: "Asia/Kolkata" }, at(15))).toBe(false);
  });

  it("dateKey is YYYYMMDD and invalid timezones fall back to UTC", () => {
    expect(dateKey(at(9), "UTC")).toBe("20261021");
    expect(dateKey(at(9), "Not/AZone")).toBe("20261021");
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });
});

describe("template", () => {
  it("renders known placeholders and blanks unknown ones", () => {
    const lead = { firstName: "Jane", company: "Acme" };
    expect(renderTemplate("Hi {{firstName}} at {{ company }} {{unknown}}!", lead)).toBe("Hi Jane at Acme !");
    expect(renderTemplate("", lead)).toBe("");
  });
});

describe("isBlacklisted", () => {
  const bl = { profileUrls: new Set(["https://www.linkedin.com/in/blocked"]), domains: ["acme.com"] };

  it("matches exact profile URL after normalisation", () => {
    expect(isBlacklisted({ linkedinUrl: "https://linkedin.com/in/Blocked/" }, bl).blacklisted).toBe(true);
  });

  it("matches domain via email or company domain", () => {
    expect(isBlacklisted({ linkedinUrl: "https://www.linkedin.com/in/x", email: "x@eu.acme.com" }, bl).reason).toBe(
      "domain:acme.com",
    );
    expect(isBlacklisted({ linkedinUrl: "https://www.linkedin.com/in/x", companyDomain: "acme.com" }, bl).blacklisted).toBe(
      true,
    );
    expect(isBlacklisted({ linkedinUrl: "https://www.linkedin.com/in/x", email: "x@other.com" }, bl).blacklisted).toBe(
      false,
    );
  });
});
