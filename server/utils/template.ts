type TemplateLead = {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
};

const FIELDS: Record<string, (l: TemplateLead) => string | null | undefined> = {
  firstname: (l) => l.firstName,
  first_name: (l) => l.firstName,
  lastname: (l) => l.lastName,
  last_name: (l) => l.lastName,
  company: (l) => l.company,
  title: (l) => l.title,
  job_title: (l) => l.title,
};

/** Replaces {{firstName}}-style placeholders; unknown or empty fields render as ''. */
export function renderTemplate(body: string | null | undefined, lead: TemplateLead = {}): string {
  if (!body) return "";
  return String(body)
    .replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key: string) => {
      const getter = FIELDS[key.toLowerCase()];
      return getter ? getter(lead) || "" : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
