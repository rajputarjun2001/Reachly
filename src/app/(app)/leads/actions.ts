"use server";

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { parseLeadsCsv } from "@/lib/leads/csv";
import { CSV_MAX_BYTES } from "@/lib/leads/constants";
import {
  createLead,
  deleteLead,
  deleteLeadList,
  importCsvAsNewList,
  listLeadsForList,
  renameLeadList,
  updateLead,
  LeadDataError,
} from "@/lib/leads/repository";
import type { ImportLeadsResult, PaginatedLeads } from "@/lib/leads/types";
import { sanitizeLeadInput } from "@/lib/leads/validation";

export type LeadsActionResult = {
  error?: string;
  success?: string;
  import?: ImportLeadsResult & { duplicatesInFile?: number; listId?: string };
  leads?: PaginatedLeads;
};

function mapLeadError(err: unknown): string {
  if (err instanceof LeadDataError) return err.message;
  return "Something went wrong. Please try again.";
}

export async function importLeadListCsvAction(formData: FormData): Promise<LeadsActionResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const listName = String(formData.get("listName") ?? "").trim();
  const file = formData.get("file");
  if (!listName) return { error: "List name is required." };
  if (!(file instanceof File)) return { error: "Choose a CSV file to upload." };
  if (file.size > CSV_MAX_BYTES) {
    return { error: `File exceeds the ${CSV_MAX_BYTES / (1024 * 1024)}MB import limit.` };
  }

  const text = await file.text();
  const parsed = parseLeadsCsv(text);
  if (!parsed.ok) return { error: parsed.error };

  try {
    const { listId, result } = await importCsvAsNewList(listName, parsed.rows);
    revalidatePath("/leads");
    const parts = [
      `${result.inserted} inserted`,
      result.skipped ? `${result.skipped} skipped (duplicates)` : null,
      result.invalid ? `${result.invalid} invalid` : null,
      parsed.duplicatesInFile ? `${parsed.duplicatesInFile} duplicate rows in file` : null,
    ].filter(Boolean);
    return {
      success: `Import complete: ${parts.join(", ")}.`,
      import: { ...result, duplicatesInFile: parsed.duplicatesInFile, listId },
    };
  } catch (err) {
    return { error: mapLeadError(err) };
  }
}

export async function renameLeadListAction(listId: string, name: string): Promise<LeadsActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await renameLeadList(listId, name);
    revalidatePath("/leads");
    return { success: "List renamed." };
  } catch (err) {
    return { error: mapLeadError(err) };
  }
}

export async function deleteLeadListAction(listId: string): Promise<LeadsActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await deleteLeadList(listId);
    revalidatePath("/leads");
    return { success: "List deleted." };
  } catch (err) {
    return { error: mapLeadError(err) };
  }
}

export async function fetchLeadsForListAction(
  listId: string,
  search: string,
  page: number,
): Promise<LeadsActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    const leads = await listLeadsForList(listId, { search, page });
    return { leads };
  } catch (err) {
    return { error: mapLeadError(err) };
  }
}

export async function saveLeadAction(
  leadId: string | null,
  formData: FormData,
): Promise<LeadsActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };

  const input = sanitizeLeadInput({
    first_name: String(formData.get("first_name") ?? ""),
    last_name: String(formData.get("last_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    company: String(formData.get("company") ?? ""),
    job_title: String(formData.get("job_title") ?? ""),
    linkedin_url: String(formData.get("linkedin_url") ?? ""),
    lead_list_id: String(formData.get("lead_list_id") ?? "") || null,
  });

  try {
    if (leadId) {
      await updateLead(leadId, input);
    } else {
      await createLead(input);
    }
    revalidatePath("/leads");
    return { success: leadId ? "Lead updated." : "Lead created." };
  } catch (err) {
    return { error: mapLeadError(err) };
  }
}

export async function deleteLeadAction(leadId: string): Promise<LeadsActionResult> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  try {
    await deleteLead(leadId);
    revalidatePath("/leads");
    return { success: "Lead deleted." };
  } catch (err) {
    return { error: mapLeadError(err) };
  }
}
