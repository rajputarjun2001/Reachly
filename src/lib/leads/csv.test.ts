import { describe, expect, it } from "vitest";
import { parseLeadsCsv } from "./csv";

describe("parseLeadsCsv", () => {
  it("rejects missing header data", () => {
    expect(parseLeadsCsv("linkedin_url\n").ok).toBe(false);
  });

  it("requires linkedin_url column", () => {
    const result = parseLeadsCsv("email\na@b.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/linkedin_url/i);
  });

  it("parses valid rows and dedupes within file", () => {
    const csv = `linkedin_url,first_name
https://www.linkedin.com/in/a/,A
https://www.linkedin.com/in/a/,Duplicate
https://www.linkedin.com/in/b/,B`;
    const result = parseLeadsCsv(csv);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(2);
      expect(result.duplicatesInFile).toBe(1);
    }
  });

  it("skips rows with invalid email", () => {
    const csv = `linkedin_url,email
https://www.linkedin.com/in/a/,not-an-email`;
    const result = parseLeadsCsv(csv);
    expect(result.ok).toBe(false);
  });
});
