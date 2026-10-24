import { parse } from "csv-parse/sync";
import { unprocessable } from "./errors";

export const MAX_ROWS = 10000;

const COLUMN_ALIASES = {
  linkedin_url: ["linkedin_url", "linkedin", "profile_url", "linkedin_profile_url", "url"],
  first_name: ["first_name", "firstname", "first"],
  last_name: ["last_name", "lastname", "last"],
  email: ["email", "email_address"],
  company: ["company", "company_name", "organization"],
  company_domain: ["company_domain", "domain", "website", "company_website"],
  title: ["title", "job_title", "jobtitle", "position", "headline"],
} as const;

export type CsvColumn = keyof typeof COLUMN_ALIASES;
export type CsvLeadRow = Partial<Record<CsvColumn, string>> & { linkedin_url: string };

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function parseLeadsCsv(input: Buffer | string): CsvLeadRow[] {
  if (!input || !input.length) throw unprocessable("CSV file is empty");

  let records: Record<string, string>[];
  try {
    records = parse(input, {
      columns: (headers: string[]) => headers.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw unprocessable(`Could not parse CSV: ${(err as Error).message}`);
  }

  if (!records.length) throw unprocessable("CSV contains no data rows");
  if (records.length > MAX_ROWS) throw unprocessable(`CSV exceeds ${MAX_ROWS} rows`);

  const headers = Object.keys(records[0]);
  const columnMap: Partial<Record<CsvColumn, string>> = {};
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES) as [CsvColumn, readonly string[]][]) {
    const found = aliases.find((a) => headers.includes(a));
    if (found) columnMap[canonical] = found;
  }
  if (!columnMap.linkedin_url) throw unprocessable("CSV must include a linkedin_url column");

  return records.map((row) => {
    const out: Partial<Record<CsvColumn, string>> = {};
    for (const [canonical, header] of Object.entries(columnMap) as [CsvColumn, string][]) {
      out[canonical] = row[header] ? String(row[header]).trim() : "";
    }
    return out as CsvLeadRow;
  });
}
