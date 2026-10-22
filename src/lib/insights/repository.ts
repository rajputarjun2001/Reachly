import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import type { CampaignStatus } from "@/lib/campaigns/types";
import {
  bucketCreatedAtByDay,
  lastNDayKeys,
  tallyStatuses,
} from "./aggregations";
import type { AnalyticsInsights, DashboardInsights } from "./types";

const LEAD_SAMPLE_CAP = 5000;

export class InsightsDataError extends Error {
  constructor(
    message: string,
    public code: string = "INSIGHTS_ERROR",
  ) {
    super(message);
  }
}

function mapSchemaError(error: { code?: string; message?: string }) {
  const hint = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    hint.includes("schema cache") ||
    (hint.includes("relation") && hint.includes("does not exist"))
  ) {
    throw new InsightsDataError(
      "Required database tables are missing. Apply migrations with supabase db push.",
      "SCHEMA_MISSING",
    );
  }
}

async function countTable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "leads" | "lead_lists" | "campaigns",
  workspaceId: string,
) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) {
    mapSchemaError(error);
    throw new InsightsDataError(`Failed to count ${table}`, "COUNT_FAILED");
  }
  return count ?? 0;
}

async function fetchTimestampsSince(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "leads" | "campaigns",
  workspaceId: string,
  sinceIso: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from(table)
    .select("created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(LEAD_SAMPLE_CAP);

  if (error) {
    mapSchemaError(error);
    throw new InsightsDataError(`Failed to load ${table} activity`, "QUERY_FAILED");
  }
  return (data ?? []).map((r) => r.created_at as string);
}

export async function getDashboardInsights(): Promise<DashboardInsights> {
  const ctx = await requireWorkspaceContext();
  const supabase = await createClient();

  const [total_leads, lead_list_count, campaign_count] = await Promise.all([
    countTable(supabase, "leads", ctx.workspaceId),
    countTable(supabase, "lead_lists", ctx.workspaceId),
    countTable(supabase, "campaigns", ctx.workspaceId),
  ]);

  const { data: statusRows, error: statusError } = await supabase
    .from("campaigns")
    .select("status")
    .eq("workspace_id", ctx.workspaceId);

  if (statusError) {
    mapSchemaError(statusError);
    throw new InsightsDataError("Failed to load campaign statuses", "QUERY_FAILED");
  }

  const campaign_by_status = tallyStatuses(
    (statusRows ?? []).map((r) => r.status as CampaignStatus),
  );

  const { data: recent, error: recentError } = await supabase
    .from("campaigns")
    .select(
      `
      id, name, status, created_at,
      lead_lists ( leads ( count ) ),
      campaign_steps ( count )
    `,
    )
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (recentError) {
    mapSchemaError(recentError);
    throw new InsightsDataError("Failed to load recent campaigns", "QUERY_FAILED");
  }

  const recent_campaigns = (recent ?? []).map((row) => {
    const nested = row as typeof row & {
      lead_lists?: { leads?: { count: number }[] } | null;
      campaign_steps?: { count: number }[];
    };
    return {
      id: nested.id,
      name: nested.name,
      status: nested.status as CampaignStatus,
      lead_count: nested.lead_lists?.leads?.[0]?.count ?? 0,
      step_count: nested.campaign_steps?.[0]?.count ?? 0,
      created_at: nested.created_at,
    };
  });

  const dayKeys = lastNDayKeys(7);
  const since = `${dayKeys[0]}T00:00:00.000Z`;
  const leadTimestamps = await fetchTimestampsSince(supabase, "leads", ctx.workspaceId, since);
  const leads_added_last_7_days = bucketCreatedAtByDay(leadTimestamps, dayKeys);

  return {
    total_leads,
    lead_list_count,
    campaign_count,
    campaign_by_status,
    recent_campaigns,
    leads_added_last_7_days,
  };
}

export async function getAnalyticsInsights(): Promise<AnalyticsInsights> {
  const ctx = await requireWorkspaceContext();
  const supabase = await createClient();

  const [total_leads, lead_list_count, campaign_count] = await Promise.all([
    countTable(supabase, "leads", ctx.workspaceId),
    countTable(supabase, "lead_lists", ctx.workspaceId),
    countTable(supabase, "campaigns", ctx.workspaceId),
  ]);

  const { data: statusRows, error: statusError } = await supabase
    .from("campaigns")
    .select("status")
    .eq("workspace_id", ctx.workspaceId);

  if (statusError) {
    mapSchemaError(statusError);
    throw new InsightsDataError("Failed to load campaign statuses", "QUERY_FAILED");
  }

  const campaign_by_status = tallyStatuses(
    (statusRows ?? []).map((r) => r.status as CampaignStatus),
  );

  const { data: lists, error: listsError } = await supabase
    .from("lead_lists")
    .select("id, name, leads ( count )")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (listsError) {
    mapSchemaError(listsError);
    throw new InsightsDataError("Failed to load lead lists", "QUERY_FAILED");
  }

  const leads_by_list = (lists ?? []).map((row) => {
    const nested = row as typeof row & { leads?: { count: number }[] };
    return {
      list_id: nested.id,
      name: nested.name,
      count: nested.leads?.[0]?.count ?? 0,
    };
  });

  const dayKeys30 = lastNDayKeys(30);
  const since30 = `${dayKeys30[0]}T00:00:00.000Z`;
  const [leadTs, campTs] = await Promise.all([
    fetchTimestampsSince(supabase, "leads", ctx.workspaceId, since30),
    fetchTimestampsSince(supabase, "campaigns", ctx.workspaceId, since30),
  ]);

  return {
    total_leads,
    lead_list_count,
    campaign_count,
    campaign_by_status,
    leads_by_list,
    leads_created_last_30_days: bucketCreatedAtByDay(leadTs, dayKeys30),
    campaigns_created_last_30_days: bucketCreatedAtByDay(campTs, dayKeys30),
  };
}

export async function getWorkspaceGreetingName(): Promise<string> {
  const ctx = await requireWorkspaceContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  const name = data?.display_name?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  if (ctx.email) return ctx.email.split("@")[0];
  return "there";
}
