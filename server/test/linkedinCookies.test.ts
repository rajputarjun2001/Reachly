import { describe, expect, it } from "vitest";
import { parseLinkedInSessionCookies } from "../utils/linkedinCookies";
import { AppError } from "../utils/errors";

describe("parseLinkedInSessionCookies", () => {
  it("accepts a bare li_at token", () => {
    const token = "AQEDAS1234567890abcdefghijklmnop";
    const cookies = parseLinkedInSessionCookies(token);
    expect(cookies).toEqual([
      expect.objectContaining({ name: "li_at", value: token, domain: ".linkedin.com", path: "/" }),
    ]);
  });

  it("accepts li_at= value pairs", () => {
    const cookies = parseLinkedInSessionCookies("li_at=abc123; JSESSIONID=xyz");
    expect(cookies.map((c) => c.name)).toEqual(["li_at", "JSESSIONID"]);
  });

  it("accepts a JSON array export", () => {
    const cookies = parseLinkedInSessionCookies(
      JSON.stringify([{ name: "li_at", value: "tok", domain: ".linkedin.com", path: "/" }]),
    );
    expect(cookies[0].value).toBe("tok");
  });

  it("accepts EditThisCookie-style { cookies: [...] }", () => {
    const cookies = parseLinkedInSessionCookies(
      JSON.stringify({ cookies: [{ name: "li_at", value: "tok2", domain: "www.linkedin.com", path: "/" }] }),
    );
    expect(cookies[0].value).toBe("tok2");
  });

  it("rejects empty input and JSON without li_at", () => {
    expect(() => parseLinkedInSessionCookies("")).toThrow(AppError);
    expect(() => parseLinkedInSessionCookies(JSON.stringify([{ name: "JSESSIONID", value: "x" }]))).toThrow(AppError);
  });
});
