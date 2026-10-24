import "server-only";

import * as leadsDomain from "@server/domain/leads";
import type { LeadDoc, LeadListDoc } from "@server/models";
import { badRequest } from "@server/utils/errors";
import { ensureDb } from "@/lib/server/backend";
import { requireAuthContext } from "@/lib/workspace/context";
import { LEADS_PAGE_SIZE } from "./constants";
import type { ImportLeadsResult, LeadListSummary, LeadRow, LeadStatus, PaginatedLeads } from "./types";
import { sanitizeLeadInput, validateLeadListName } from "./validation";

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date().toISOString();
}

function mapList(list: LeadListDoc, leadCount: number): LeadListSummary {
  return {
    id: String(list._id),
    workspace_id: String(list.workspaceId),
    name: list.name,
    description: list.description ?? null,
    created_by: list.uploadedBy ? String(list.uploadedBy) : null,
    created_at: iso(list.get("createdAt")),
    updated_at: iso(list.get("updatedAt")),
    lead_count: leadCount,
  };
}

export function mapLead(lead: LeadDoc): LeadRow {
  return {
    id: String(lead._id),
    workspace_id: String(lead.workspaceId),
    lead_list_id: lead.listId ? String(lead.listId) : null,
    first_name: lead.firstName ?? null,
    last_name: lead.lastName ?? null,
    email: lead.email ?? null,
    company: lead.company ?? null,
    job_title: lead.title ?? null,
    linkedin_url: lead.linkedinUrl ?? null,
    source: lead.source ?? "csv_import",
    status: (lead.status ?? "pending") as LeadStatus,
    created_at: iso(lead.get("createdAt")),
    updated_at: iso(lead.get("updatedAt")),
  };
}

async function scoped() {
  const ctx = await requireAuthContext();
  await ensureDb();
  return ctx;
}

export async function listLeadLists(): Promise<LeadListSummary[]> {
  const ctx = await scoped();
  const lists = await leadsDomain.listListsWithCounts(ctx);
  return lists.map(({ list, leadCount }) => mapList(list, leadCount));
}

export async function createLeadList(name: string, description?: string | null): Promise<LeadListSummary> {
  const ctx = await scoped();
  const validName = validateLeadListName(name);
  if (!validName) throw badRequest("Invalid list name");
  return mapList(await leadsDomain.createList(ctx, { name: validName, description }), 0);
}

export async function renameLeadList(listId: string, name: string): Promise<void> {
  const ctx = await scoped();
  const validName = validateLeadListName(name);
  if (!validName) throw badRequest("Invalid list name");
  await leadsDomain.renameList(ctx, listId, validName);
}

/** Deletes the list and every lead in it. */
export async function deleteLeadList(listId: string): Promise<void> {
  const ctx = await scoped();
  await leadsDomain.deleteList(ctx, listId);
}

export async function listLeadsForList(
  listId: string,
  options?: { search?: string; page?: number; pageSize?: number },
): Promise<PaginatedLeads> {
  const ctx = await scoped();
  const pageSize = Math.min(100, options?.pageSize ?? LEADS_PAGE_SIZE);
  const result = await leadsDomain.listLeads(ctx, listId, {
    page: options?.page,
    limit: pageSize,
    search: options?.search,
  });
  return { leads: result.leads.map(mapLead), total: result.total, page: result.page, pageSize };
}

function toDomainInput(input: ReturnType<typeof sanitizeLeadInput>): leadsDomain.LeadInput {
  return {
    firstName: input.first_name,
    lastName: input.last_name,
    email: input.email,
    company: input.company,
    title: input.job_title,
    linkedinUrl: input.linkedin_url,
  };
}

export async function createLead(input: ReturnType<typeof sanitizeLeadInput>): Promise<LeadRow> {
  const ctx = await scoped();
  const row = sanitizeLeadInput(input);
  if (!row.lead_list_id) throw badRequest("Choose a lead list");
  return mapLead(await leadsDomain.createLead(ctx, row.lead_list_id, toDomainInput(row)));
}

export async function updateLead(leadId: string, input: ReturnType<typeof sanitizeLeadInput>): Promise<LeadRow> {
  const ctx = await scoped();
  return mapLead(await leadsDomain.updateLead(ctx, leadId, toDomainInput(sanitizeLeadInput(input))));
}

export async function deleteLead(leadId: string): Promise<void> {
  const ctx = await scoped();
  await leadsDomain.deleteLead(ctx, leadId);
}

/** Creates a list from an uploaded CSV. Rows are normalized, deduped and blacklist-filtered server-side. */
export async function importCsvAsNewList(
  listName: string,
  file: Buffer,
): Promise<{ listId: string; result: ImportLeadsResult }> {
  const ctx = await scoped();
  const validName = validateLeadListName(listName);
  if (!validName) throw badRequest("Invalid list name");
  const { list, summary } = await leadsDomain.importCsvAsNewList(ctx, validName, file);
  return {
    listId: String(list._id),
    result: { inserted: summary.imported, skipped: summary.skipped, blacklisted: summary.blacklisted },
  };
}
