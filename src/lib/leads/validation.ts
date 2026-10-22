const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return EMAIL_RE.test(trimmed) ? trimmed : null;
}

export function normalizeLinkedInUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!url.hostname.includes("linkedin.com")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validateLeadListName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120) return null;
  return trimmed;
}

export type LeadInput = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
  linkedin_url?: string | null;
  lead_list_id?: string | null;
};

export function sanitizeLeadInput(input: LeadInput) {
  const linkedin_url = normalizeLinkedInUrl(input.linkedin_url ?? null);
  const email = normalizeEmail(input.email ?? null);
  return {
    first_name: input.first_name?.trim() || null,
    last_name: input.last_name?.trim() || null,
    email,
    company: input.company?.trim() || null,
    job_title: input.job_title?.trim() || null,
    linkedin_url,
    lead_list_id: input.lead_list_id ?? null,
  };
}
