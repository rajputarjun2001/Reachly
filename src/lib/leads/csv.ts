import { CSV_MAX_ROWS } from "./constants";
import { normalizeEmail, normalizeLinkedInUrl } from "./validation";

export type ParsedCsvLead = {
  linkedin_url: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  source: string;
};

export type CsvParseResult =
  | { ok: true; rows: ParsedCsvLead[]; duplicatesInFile: number }
  | { ok: false; error: string };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((c) => c.trim());
}

function headerIndex(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  for (const name of names) {
    const idx = lower.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseLeadsCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { ok: false, error: "CSV must include a header row and at least one data row." };
  }

  const headers = parseCsvLine(lines[0]);
  const linkedinIdx = headerIndex(headers, ["linkedin_url", "linkedin", "profile_url"]);
  if (linkedinIdx < 0) {
    return { ok: false, error: "Missing required column: linkedin_url" };
  }

  const firstIdx = headerIndex(headers, ["first_name", "firstname"]);
  const lastIdx = headerIndex(headers, ["last_name", "lastname"]);
  const emailIdx = headerIndex(headers, ["email"]);
  const companyIdx = headerIndex(headers, ["company", "organization"]);
  const titleIdx = headerIndex(headers, ["title", "job_title", "jobtitle"]);

  const dataLines = lines.slice(1);
  if (dataLines.length > CSV_MAX_ROWS) {
    return { ok: false, error: `CSV exceeds maximum of ${CSV_MAX_ROWS} rows per import.` };
  }

  const seen = new Set<string>();
  const rows: ParsedCsvLead[] = [];
  let duplicatesInFile = 0;

  for (const line of dataLines) {
    const cols = parseCsvLine(line);
    const rawLinkedin = cols[linkedinIdx] ?? "";
    const linkedin_url = normalizeLinkedInUrl(rawLinkedin);
    if (!linkedin_url) continue;

    const key = linkedin_url.toLowerCase();
    if (seen.has(key)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(key);

    const emailRaw = emailIdx >= 0 ? cols[emailIdx] : "";
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    if (emailRaw && !email) continue;

    rows.push({
      linkedin_url,
      first_name: firstIdx >= 0 ? cols[firstIdx] || null : null,
      last_name: lastIdx >= 0 ? cols[lastIdx] || null : null,
      email,
      company: companyIdx >= 0 ? cols[companyIdx] || null : null,
      job_title: titleIdx >= 0 ? cols[titleIdx] || null : null,
      source: "csv_import",
    });
  }

  if (rows.length === 0) {
    return { ok: false, error: "No valid rows found. Check linkedin_url values." };
  }

  return { ok: true, rows, duplicatesInFile };
}
