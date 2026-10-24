"use server";

import { revalidatePath } from "next/cache";
import { isBackendConfigured } from "@/lib/env";
import { CSV_MAX_BYTES } from "@/lib/leads/constants";
import {
  createLead,
  deleteLead,
  deleteLeadList,
  importCsvAsNewList,
  listLeadsForList,
  renameLeadList,
  updateLead,
} from "@/lib/leads/repository";
import type { ImportLeadsResult, PaginatedLeads } from "@/lib/leads/types";
import { sanitizeLeadInput } from "@/lib/leads/validation";
import { actionErrorMessage } from "@/lib/server/backend";

export type LeadsActionResult = {
  error?: string;
  success?: string;
  import?: ImportLeadsResult & { listId?: string };
  leads?: PaginatedLeads;
};

const NOT_CONFIGURED = { error: "Backend is not configured." };

export async function importLeadListCsvAction(formData: FormData): Promise<LeadsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;

  const listName = String(formData.get("listName") ?? "").trim();
  const file = formData.get("file");
  if (!listName) return { error: "List name is required." };
  if (!(file instanceof File)) return { error: "Choose a CSV file to upload." };
  if (file.size > CSV_MAX_BYTES) {
    return { error: `File exceeds the ${CSV_MAX_BYTES / (1024 * 1024)}MB import limit.` };
  }

  try {
    const { listId, result } = await importCsvAsNewList(listName, Buffer.from(await file.arrayBuffer()));
    revalidatePath("/leads");
    const parts = [
      `${result.inserted} imported`,
      result.skipped ? `${result.skipped} skipped (invalid or duplicate)` : null,
      result.blacklisted ? `${result.blacklisted} blacklisted` : null,
    ].filter(Boolean);
    return {
      success: `Import complete: ${parts.join(", ")}.`,
      import: { ...result, listId },
    };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function renameLeadListAction(listId: string, name: string): Promise<LeadsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await renameLeadList(listId, name);
    revalidatePath("/leads");
    return { success: "List renamed." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function deleteLeadListAction(listId: string): Promise<LeadsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await deleteLeadList(listId);
    revalidatePath("/leads");
    revalidatePath("/campaigns");
    return { success: "List deleted." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function fetchLeadsForListAction(
  listId: string,
  search: string,
  page: number,
): Promise<LeadsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const leads = await listLeadsForList(listId, { search, page });
    return { leads };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function saveLeadAction(
  leadId: string | null,
  formData: FormData,
): Promise<LeadsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;

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
    return { error: actionErrorMessage(err) };
  }
}

export async function deleteLeadAction(leadId: string): Promise<LeadsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await deleteLead(leadId);
    revalidatePath("/leads");
    return { success: "Lead deleted." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}
