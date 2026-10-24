import type { Types } from "mongoose";
import { Campaign, Lead, LeadList, LEAD_STATUSES, type LeadListDoc } from "../models";
import { parseLeadsCsv, type CsvLeadRow } from "../utils/csvParser";
import { normalizeLinkedinUrl } from "../utils/linkedinUrl";
import { isBlacklisted, loadBlacklist } from "../utils/blacklist";
import { badRequest, conflict, notFound, unprocessable } from "../utils/errors";
import { escapeRegex } from "../utils/helpers";
import { oid, type AuthContext } from "./context";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ImportSummary = { imported: number; skipped: number; blacklisted: number; totalLeads: number };

function cleanName(raw: unknown, label = "name") {
  const name = String(raw ?? "").trim();
  if (!name) throw badRequest(`${label} is required`);
  if (name.length > 120) throw badRequest(`${label} must be 120 characters or fewer`);
  return name;
}

export async function findList(ctx: AuthContext, listId: string): Promise<LeadListDoc> {
  const list = await LeadList.findOne({ _id: oid(listId, "list id"), workspaceId: ctx.workspaceId });
  if (!list) throw notFound("Lead list not found");
  return list;
}

export async function createList(ctx: AuthContext, input: { name: unknown; description?: unknown }) {
  return LeadList.create({
    workspaceId: ctx.workspaceId,
    name: cleanName(input.name),
    description: input.description ? String(input.description).trim() : null,
    uploadedBy: ctx.userId,
  });
}

export async function renameList(ctx: AuthContext, listId: string, name: unknown) {
  const list = await findList(ctx, listId);
  list.name = cleanName(name);
  await list.save();
  return list;
}

export async function listLists(ctx: AuthContext) {
  return LeadList.find({ workspaceId: ctx.workspaceId }).sort({ createdAt: -1 });
}

/** Lists with live lead counts (totalLeads can drift when leads are edited individually). */
export async function listListsWithCounts(ctx: AuthContext) {
  const lists = await listLists(ctx);
  const counts = await Lead.aggregate<{ _id: unknown; count: number }>([
    { $match: { workspaceId: oid(ctx.workspaceId), listId: { $in: lists.map((l) => l._id) } } },
    { $group: { _id: "$listId", count: { $sum: 1 } } },
  ]);
  const byList = new Map(counts.map((c) => [String(c._id), c.count]));
  return lists.map((list) => ({ list, leadCount: byList.get(String(list._id)) ?? 0 }));
}

export async function deleteList(ctx: AuthContext, listId: string) {
  const list = await findList(ctx, listId);
  const inUse = await Campaign.exists({ leadListId: list._id, status: { $in: ["active", "paused"] } });
  if (inUse) throw conflict("Lead list is used by an active or paused campaign");
  await Lead.deleteMany({ listId: list._id });
  await Campaign.updateMany({ leadListId: list._id }, { $set: { leadListId: null } });
  await list.deleteOne();
  return { id: String(list._id) };
}

/** Normalizes, dedupes (within the file and against the list) and blacklist-filters rows before inserting. */
export async function importRows(ctx: AuthContext, list: LeadListDoc, rows: CsvLeadRow[], source = "csv_import") {
  const blacklist = await loadBlacklist(ctx.workspaceId);
  const existing = new Set(
    (await Lead.find({ listId: list._id }).select("linkedinUrl").lean()).map((l) => l.linkedinUrl),
  );

  let skipped = 0;
  let blacklisted = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const row of rows) {
    const linkedinUrl = normalizeLinkedinUrl(row.linkedin_url);
    if (!linkedinUrl || existing.has(linkedinUrl)) {
      skipped += 1;
      continue;
    }
    existing.add(linkedinUrl);

    const email = row.email && EMAIL_RE.test(row.email) ? row.email.toLowerCase() : undefined;
    const lead = {
      listId: list._id,
      workspaceId: list.workspaceId,
      linkedinUrl,
      firstName: row.first_name || undefined,
      lastName: row.last_name || undefined,
      email,
      company: row.company || undefined,
      companyDomain: row.company_domain || undefined,
      title: row.title || undefined,
      source,
      status: "pending",
    };
    if (isBlacklisted(lead, blacklist).blacklisted) {
      blacklisted += 1;
      continue;
    }
    toInsert.push(lead);
  }

  let imported = 0;
  if (toInsert.length) {
    try {
      const docs = await Lead.insertMany(toInsert, { ordered: false });
      imported = docs.length;
    } catch (err) {
      // Duplicate-key races are counted as skipped; anything else is a real failure.
      const e = err as { writeErrors?: unknown; code?: number; insertedDocs?: unknown[]; result?: { insertedCount?: number } };
      if (!e.writeErrors && e.code !== 11000) throw err;
      imported = e.insertedDocs?.length ?? e.result?.insertedCount ?? 0;
      skipped += toInsert.length - imported;
    }
  }

  list.totalLeads = await Lead.countDocuments({ listId: list._id });
  list.uploadedAt = new Date();
  list.uploadedBy = oid(ctx.userId);
  await list.save();
  return { imported, skipped, blacklisted, totalLeads: list.totalLeads } satisfies ImportSummary;
}

export async function importCsv(ctx: AuthContext, listId: string, file: Buffer | string | undefined) {
  const list = await findList(ctx, listId);
  if (!file || !file.length) throw unprocessable('CSV file is required (multipart field "file")');
  return importRows(ctx, list, parseLeadsCsv(file));
}

/** Creates a list and imports the CSV into it; the list is removed again if nothing could be parsed. */
export async function importCsvAsNewList(ctx: AuthContext, name: unknown, file: Buffer | string) {
  const rows = parseLeadsCsv(file);
  const list = await createList(ctx, { name });
  try {
    const summary = await importRows(ctx, list, rows);
    return { list, summary };
  } catch (err) {
    await Lead.deleteMany({ listId: list._id });
    await list.deleteOne();
    throw err;
  }
}

export async function listLeads(
  ctx: AuthContext,
  listId: string,
  opts: { page?: number; limit?: number; status?: string | string[]; search?: string } = {},
) {
  const list = await findList(ctx, listId);
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(200, Math.max(1, opts.limit || 50));
  const filter: Record<string, unknown> = { listId: list._id, workspaceId: list.workspaceId };
  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : String(opts.status).split(",");
    if (statuses.some((s) => !(LEAD_STATUSES as readonly string[]).includes(s))) throw badRequest("Invalid status filter");
    filter.status = { $in: statuses };
  }
  const q = opts.search?.trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ firstName: re }, { lastName: re }, { email: re }, { company: re }, { title: re }, { linkedinUrl: re }];
  }
  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Lead.countDocuments(filter),
  ]);
  return { leads, total, page, limit, pages: Math.ceil(total / limit) };
}

export type LeadInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  linkedinUrl?: string | null;
};

function sanitizeLead(input: LeadInput) {
  const linkedinUrl = normalizeLinkedinUrl(input.linkedinUrl);
  if (!linkedinUrl) throw badRequest("A valid LinkedIn profile URL is required");
  const email = input.email?.trim().toLowerCase() || undefined;
  if (email && !EMAIL_RE.test(email)) throw badRequest("Enter a valid email address");
  const opt = (v: string | null | undefined) => v?.trim() || undefined;
  return {
    linkedinUrl,
    email,
    firstName: opt(input.firstName),
    lastName: opt(input.lastName),
    company: opt(input.company),
    title: opt(input.title),
  };
}

async function refreshListCount(listId: Types.ObjectId) {
  await LeadList.updateOne({ _id: listId }, { $set: { totalLeads: await Lead.countDocuments({ listId }) } });
}

export async function createLead(ctx: AuthContext, listId: string, input: LeadInput) {
  const list = await findList(ctx, listId);
  const data = sanitizeLead(input);
  if (await Lead.exists({ listId: list._id, linkedinUrl: data.linkedinUrl })) {
    throw conflict("This LinkedIn profile is already in the list");
  }
  const lead = await Lead.create({ ...data, listId: list._id, workspaceId: list.workspaceId, source: "manual" });
  await refreshListCount(list._id);
  return lead;
}

export async function updateLead(ctx: AuthContext, leadId: string, input: LeadInput) {
  const lead = await Lead.findOne({ _id: oid(leadId, "lead id"), workspaceId: ctx.workspaceId });
  if (!lead) throw notFound("Lead not found");
  const data = sanitizeLead(input);
  if (data.linkedinUrl !== lead.linkedinUrl && (await Lead.exists({ listId: lead.listId, linkedinUrl: data.linkedinUrl }))) {
    throw conflict("This LinkedIn profile is already in the list");
  }
  lead.set(data);
  await lead.save();
  return lead;
}

export async function deleteLead(ctx: AuthContext, leadId: string) {
  const lead = await Lead.findOneAndDelete({ _id: oid(leadId, "lead id"), workspaceId: ctx.workspaceId });
  if (!lead) throw notFound("Lead not found");
  await refreshListCount(lead.listId);
  return { id: String(lead._id) };
}
