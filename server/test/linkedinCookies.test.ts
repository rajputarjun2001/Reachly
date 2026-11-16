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
    expect(cookies.every((c) => c.domain === ".www.linkedin.com")).toBe(true);
  });

  it("keeps JSESSIONID readable by LinkedIn's page script and restores its quotes", () => {
    const cookies = parseLinkedInSessionCookies("li_at=abc123; JSESSIONID=ajax:123; bcookie=v2");
    const byName = Object.fromEntries(cookies.map((c) => [c.name, c]));
    expect(byName.li_at.httpOnly).toBe(true);
    expect(byName.JSESSIONID.httpOnly).toBe(false);
    expect(byName.JSESSIONID.value).toBe('"ajax:123"');
    expect(byName.bcookie.domain).toBe(".linkedin.com");
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
    expect(cookies.every((c) => c.domain === ".www.linkedin.com")).toBe(true);
  });

  it("accepts cookie objects read straight from a browser", () => {
    const fromBrowser = [
      { name: "li_at", value: "tok", domain: ".www.linkedin.com", path: "/", httpOnly: true, secure: true, expires: 1900000000 },
      { name: "JSESSIONID", value: '"ajax:1"', domain: ".www.linkedin.com", path: "/", httpOnly: false, secure: true },
      { name: "bcookie", value: "v=2", domain: ".linkedin.com", path: "/" },
    ];
    const cookies = parseLinkedInSessionCookies(fromBrowser);
    expect(cookies.map((c) => `${c.name}@${c.domain}`)).toEqual([
      "li_at@.www.linkedin.com",
      "JSESSIONID@.www.linkedin.com",
      "bcookie@.linkedin.com",
    ]);
    expect(cookies[0].expires).toBe(1900000000);
    expect(parseLinkedInSessionCookies({ cookies: fromBrowser })).toEqual(cookies);
    expect(() => parseLinkedInSessionCookies([{ name: "bcookie", value: "x" }])).toThrow(AppError);
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
  it("keeps LinkedIn cookies and puts auth cookies on .www.linkedin.com", () => {
    const normalized = normalizeLinkedInCookiesForPlaywright([
      { name: "li_at", value: "a", domain: "www.linkedin.com", path: "/" },
      { name: "JSESSIONID", value: "b", domain: "linkedin.com", path: "/" },
      { name: "other", value: "x", domain: ".example.com", path: "/" },
      { name: "evil", value: "x", domain: ".notlinkedin.com", path: "/" },
    ] as never);
    expect(normalized.map((c) => c.name)).toEqual(["li_at", "JSESSIONID"]);
    expect(normalized.every((c) => c.domain === ".www.linkedin.com")).toBe(true);
  });

  it("repairs sessions stored with flattened domains and keeps other cookies where LinkedIn set them", () => {
    const normalized = normalizeLinkedInCookiesForPlaywright([
      { name: "li_at", value: "a", domain: ".linkedin.com", path: "/", httpOnly: true },
      { name: "JSESSIONID", value: "b", domain: ".linkedin.com", path: "/", httpOnly: true },
      { name: "bcookie", value: "c", domain: ".linkedin.com", path: "/" },
      { name: "lang", value: "d", domain: "linkedin.com", path: "/" },
    ] as never);
    const byName = Object.fromEntries(normalized.map((c) => [c.name, c]));
    expect(byName.li_at.domain).toBe(".www.linkedin.com");
    expect(byName.JSESSIONID.domain).toBe(".www.linkedin.com");
    expect(byName.JSESSIONID.httpOnly).toBe(false);
    expect(byName.bcookie.domain).toBe(".linkedin.com");
    expect(byName.lang.domain).toBe(".linkedin.com");
  });

  it("collapses duplicate copies of a cookie, keeping the last one", () => {
    const normalized = normalizeLinkedInCookiesForPlaywright([
      { name: "JSESSIONID", value: "old", domain: ".linkedin.com", path: "/" },
      { name: "li_at", value: "a", domain: ".www.linkedin.com", path: "/" },
      { name: "JSESSIONID", value: "new", domain: ".www.linkedin.com", path: "/" },
    ] as never);
    expect(normalized.filter((c) => c.name === "JSESSIONID").map((c) => c.value)).toEqual(["new"]);
  });
});
