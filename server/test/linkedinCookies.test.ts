import { describe, expect, it } from "vitest";
import {
  normalizeLinkedInCookiesForPlaywright,
  parseLinkedInSessionCookies,
} from "../utils/linkedinCookies";
import { AppError } from "../utils/errors";

describe("parseLinkedInSessionCookies", () => {
  it("rejects a bare li_at token", () => {
    const token = "AQEDAS1234567890abcdefghijklmnop";
    expect(() => parseLinkedInSessionCookies(token)).toThrow(AppError);
  });

  it("accepts li_at= value pairs with JSESSIONID", () => {
    const cookies = parseLinkedInSessionCookies("li_at=abc123; JSESSIONID=xyz");
    expect(cookies.map((c) => c.name)).toEqual(["li_at", "JSESSIONID"]);
    expect(cookies.every((c) => c.domain === ".linkedin.com")).toBe(true);
  });

  it("accepts a JSON array export with li_at and JSESSIONID", () => {
    const cookies = parseLinkedInSessionCookies(
      JSON.stringify([
        { name: "li_at", value: "tok", domain: ".linkedin.com", path: "/" },
        { name: "JSESSIONID", value: "js", domain: ".linkedin.com", path: "/" },
      ]),
    );
    expect(cookies.map((c) => c.name)).toEqual(["li_at", "JSESSIONID"]);
  });

  it("accepts EditThisCookie-style { cookies: [...] } and normalizes domain", () => {
    const cookies = parseLinkedInSessionCookies(
      JSON.stringify({
        cookies: [
          { name: "li_at", value: "tok2", domain: "www.linkedin.com", path: "/" },
          { name: "JSESSIONID", value: "js2", domain: "linkedin.com", path: "/" },
        ],
      }),
    );
    expect(cookies[0].value).toBe("tok2");
    expect(cookies.every((c) => c.domain === ".linkedin.com")).toBe(true);
  });

  it("rejects empty input, JSON without li_at, and li_at-only JSON", () => {
    expect(() => parseLinkedInSessionCookies("")).toThrow(AppError);
    expect(() => parseLinkedInSessionCookies(JSON.stringify([{ name: "JSESSIONID", value: "x" }]))).toThrow(AppError);
    expect(() =>
      parseLinkedInSessionCookies(JSON.stringify([{ name: "li_at", value: "tok", domain: ".linkedin.com", path: "/" }])),
    ).toThrow(AppError);
  });
});

describe("normalizeLinkedInCookiesForPlaywright", () => {
  it("keeps LinkedIn cookies and fixes domains", () => {
    const normalized = normalizeLinkedInCookiesForPlaywright([
      { name: "li_at", value: "a", domain: "www.linkedin.com", path: "/" },
      { name: "JSESSIONID", value: "b", domain: "linkedin.com", path: "/" },
      { name: "other", value: "x", domain: ".example.com", path: "/" },
    ] as never);
    expect(normalized.map((c) => c.name)).toEqual(["li_at", "JSESSIONID"]);
    expect(normalized.every((c) => c.domain === ".linkedin.com")).toBe(true);
  });
});
