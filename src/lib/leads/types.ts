export type LeadListRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  lead_count?: number;
};

export type LeadRow = {
  id: string;
  workspace_id: string;
  lead_list_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type LeadListSummary = LeadListRow & {
  lead_count: number;
};

export type ImportLeadsResult = {
  inserted: number;
  skipped: number;
  invalid: number;
};

export type PaginatedLeads = {
  leads: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
};
