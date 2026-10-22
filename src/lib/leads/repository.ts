import "server-only";

import { requireWorkspaceContext } from "@/lib/workspace/context";
import { createClient } from "@/lib/supabase/server";
import { CSV_INSERT_CHUNK, LEADS_PAGE_SIZE } from "./constants";
import type { ImportLeadsResult, LeadListSummary, LeadRow, PaginatedLeads } from "./types";
import { sanitizeLeadInput, validateLeadListName } from "./validation";
import type { ParsedCsvLead } from "./csv";

export class LeadDataError extends Error {
  constructor(
    message: string,
    public code: string = "LEAD_DATA_ERROR",
  ) {
    super(message);
  }
}

async function getScopedClient() {
  const ctx = await requireWorkspaceContext();
  const supabase = await createClient();
  return { supabase, ctx };
}

export async function listLeadLists(): Promise<LeadListSummary[]> {
  const { supabase, ctx } = await getScopedClient();

  const { data: lists, error } = await supabase
    .from("lead_lists")
    .select(
      "id, workspace_id, name, description, created_by, created_at, updated_at, leads(count)",
    )
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    const hint = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      hint.includes("lead_lists") ||
      hint.includes("schema cache")
    ) {
      throw new LeadDataError(
        "Lead tables are missing in this Supabase project.",
        "SCHEMA_MISSING",
      );
    }
    throw new LeadDataError("Failed to load lead lists", "LIST_FAILED");
  }

  return (lists ?? []).map((row) => {
    const nested = row as typeof row & { leads?: { count: number }[] };
    const lead_count = nested.leads?.[0]?.count ?? 0;
    return {
      id: nested.id,
      workspace_id: nested.workspace_id,
      name: nested.name,
      description: nested.description,
      created_by: nested.created_by,
      created_at: nested.created_at,
      updated_at: nested.updated_at,
      lead_count,
    };
  });
}

export async function createLeadList(name: string, description?: string | null) {
  const { supabase, ctx } = await getScopedClient();
  const validName = validateLeadListName(name);
  if (!validName) throw new LeadDataError("Invalid list name", "VALIDATION");

  const { data, error } = await supabase
    .from("lead_lists")
    .insert({
      workspace_id: ctx.workspaceId,
      name: validName,
      description: description?.trim() || null,
      created_by: ctx.userId,
    })
    .select()
    .single();

  if (error) throw new LeadDataError("Failed to create list", "CREATE_FAILED");
  return data;
}

export async function renameLeadList(listId: string, name: string) {
  const { supabase, ctx } = await getScopedClient();
  const validName = validateLeadListName(name);
  if (!validName) throw new LeadDataError("Invalid list name", "VALIDATION");

  const { data, error } = await supabase
    .from("lead_lists")
    .update({ name: validName })
    .eq("id", listId)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();

  if (error || !data) throw new LeadDataError("Failed to rename list", "UPDATE_FAILED");
  return data;
}

export async function deleteLeadList(listId: string) {
  const { supabase, ctx } = await getScopedClient();

  const { error } = await supabase
    .from("lead_lists")
    .delete()
    .eq("id", listId)
    .eq("workspace_id", ctx.workspaceId);

  if (error) throw new LeadDataError("Failed to delete list", "DELETE_FAILED");
}

export async function listLeadsForList(
  listId: string,
  options?: { search?: string; page?: number; pageSize?: number },
): Promise<PaginatedLeads> {
  const { supabase, ctx } = await getScopedClient();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, options?.pageSize ?? LEADS_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("workspace_id", ctx.workspaceId)
    .eq("lead_list_id", listId)
    .order("created_at", { ascending: false })
    .range(from, to);

  const search = options?.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    const pattern = `%${escaped}%`;
    query = query.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern},linkedin_url.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw new LeadDataError("Failed to load leads", "LIST_LEADS_FAILED");

  return {
    leads: (data ?? []) as LeadRow[],
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function createLead(input: ReturnType<typeof sanitizeLeadInput>) {
  const { supabase, ctx } = await getScopedClient();
  const row = sanitizeLeadInput(input);

  if (!row.linkedin_url && !row.email) {
    throw new LeadDataError("LinkedIn URL or email is required", "VALIDATION");
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      workspace_id: ctx.workspaceId,
      lead_list_id: row.lead_list_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      company: row.company,
      job_title: row.job_title,
      linkedin_url: row.linkedin_url,
      source: "manual",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new LeadDataError("A lead with this LinkedIn URL already exists", "DUPLICATE");
    }
    throw new LeadDataError("Failed to create lead", "CREATE_FAILED");
  }
  return data as LeadRow;
}

export async function updateLead(leadId: string, input: ReturnType<typeof sanitizeLeadInput>) {
  const { supabase, ctx } = await getScopedClient();
  const row = sanitizeLeadInput(input);

  const { data, error } = await supabase
    .from("leads")
    .update({
      lead_list_id: row.lead_list_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      company: row.company,
      job_title: row.job_title,
      linkedin_url: row.linkedin_url,
    })
    .eq("id", leadId)
    .eq("workspace_id", ctx.workspaceId)
    .select()
    .single();

  if (error || !data) throw new LeadDataError("Failed to update lead", "UPDATE_FAILED");
  return data as LeadRow;
}

export async function deleteLead(leadId: string) {
  const { supabase, ctx } = await getScopedClient();
  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) throw new LeadDataError("Failed to delete lead", "DELETE_FAILED");
}

export async function removeLeadFromList(leadId: string) {
  const { supabase, ctx } = await getScopedClient();
  const { error } = await supabase
    .from("leads")
    .update({ lead_list_id: null })
    .eq("id", leadId)
    .eq("workspace_id", ctx.workspaceId);
  if (error) throw new LeadDataError("Failed to remove lead from list", "UPDATE_FAILED");
}

export async function importLeadsToList(
  listId: string,
  rows: ParsedCsvLead[],
): Promise<ImportLeadsResult> {
  const { supabase, ctx } = await getScopedClient();

  const { data: list } = await supabase
    .from("lead_lists")
    .select("id")
    .eq("id", listId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!list) throw new LeadDataError("Lead list not found", "NOT_FOUND");

  let inserted = 0;
  let skipped = 0;
  let invalid = 0;

  for (let i = 0; i < rows.length; i += CSV_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + CSV_INSERT_CHUNK);
    const { data, error } = await supabase.rpc("import_leads_to_list", {
      p_lead_list_id: listId,
      p_rows: chunk,
    });

    if (error) throw new LeadDataError("Import failed", "IMPORT_FAILED");

    const result = data as ImportLeadsResult;
    inserted += result.inserted ?? 0;
    skipped += result.skipped ?? 0;
    invalid += result.invalid ?? 0;
  }

  return { inserted, skipped, invalid };
}

export async function importCsvAsNewList(
  listName: string,
  rows: ParsedCsvLead[],
): Promise<{ listId: string; result: ImportLeadsResult }> {
  const list = await createLeadList(listName);
  const result = await importLeadsToList(list.id, rows);
  return { listId: list.id, result };
}
