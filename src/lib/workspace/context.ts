import { createClientIfConfigured } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceContext = {
  userId: string;
  email: string | undefined;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
};

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClientIfConfigured();
  if (!supabase) return null;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) return null;

  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("id", membership.workspace_id)
    .single();

  if (wsError || !workspace) return null;

  return {
    userId: user.id,
    email: user.email,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    role: membership.role as WorkspaceRole,
  };
}

export async function requireWorkspaceContext(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    throw new Error("Workspace context unavailable");
  }
  return ctx;
}
