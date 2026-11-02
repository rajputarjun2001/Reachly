export type LeadStatus =
  | "pending"
  | "connection_sent"
  | "connected"
  | "msg1_sent"
  | "msg2_sent"
  | "msg3_sent"
  | "replied"
  | "skipped"
  | "blacklisted";

export type LeadListRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
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
  status: LeadStatus;
  /** Set when status is skipped (or some failure paths); automation detail from the worker. */
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadListSummary = LeadListRow & {
  lead_count: number;
};

export type ImportLeadsResult = {
  inserted: number;
  skipped: number;
  blacklisted: number;
};

export type PaginatedLeads = {
  leads: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
};
