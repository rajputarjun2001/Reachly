import { LinkedInAccount, PLAN_DAILY_LIMIT, Workspace, type WorkspacePlan } from "../models";
import { badRequest, notFound } from "../utils/errors";
import { isValidTimezone } from "../utils/schedule";
import { oid, requireOwner, type AuthContext } from "./context";

export type WorkspaceSettingsInput = {
  name?: unknown;
  dailyLimitPerAccount?: unknown;
  sendingWindowStart?: unknown;
  sendingWindowEnd?: unknown;
  sendOnWeekends?: unknown;
  timezone?: unknown;
};

export async function getWorkspace(ctx: AuthContext) {
  const workspace = await Workspace.findById(oid(ctx.workspaceId));
  if (!workspace) throw notFound("Workspace not found");
  return workspace;
}

export async function updateWorkspace(ctx: AuthContext, body: WorkspaceSettingsInput) {
  requireOwner(ctx, "Only the workspace owner can change workspace settings");
  const workspace = await getWorkspace(ctx);

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw badRequest("Workspace name cannot be empty");
    if (name.length > 120) throw badRequest("Workspace name must be 120 characters or fewer");
    workspace.name = name;
  }
  if (body.dailyLimitPerAccount !== undefined) {
    const n = Number(body.dailyLimitPerAccount);
    if (!Number.isInteger(n) || n < 1) throw badRequest("Daily limit must be a positive integer");
    const plan = (workspace.plan as WorkspacePlan) || "starter";
    const cap = PLAN_DAILY_LIMIT[plan];
    if (n > cap) throw badRequest(`Daily limit cannot exceed ${cap} on the ${plan} plan`);
    workspace.dailyLimitPerAccount = n;
  }
  for (const key of ["sendingWindowStart", "sendingWindowEnd"] as const) {
    if (body[key] !== undefined) {
      const h = Number(body[key]);
      if (!Number.isInteger(h) || h < 0 || h > 24) throw badRequest(`${key} must be an integer hour between 0 and 24`);
      workspace[key] = h;
    }
  }
  if ((workspace.sendingWindowStart ?? 8) >= (workspace.sendingWindowEnd ?? 20)) {
    throw badRequest("The sending window must start before it ends");
  }
  if (body.sendOnWeekends !== undefined) {
    if (typeof body.sendOnWeekends !== "boolean") throw badRequest("sendOnWeekends must be a boolean");
    workspace.sendOnWeekends = body.sendOnWeekends;
  }
  if (body.timezone !== undefined) {
    if (!isValidTimezone(body.timezone)) throw badRequest("timezone must be a valid IANA timezone");
    workspace.timezone = body.timezone;
  }
  await workspace.save();

  // Keep per-account limits within the new workspace cap.
  await LinkedInAccount.updateMany(
    { workspaceId: workspace._id, dailyLimit: { $gt: workspace.dailyLimitPerAccount } },
    { $set: { dailyLimit: workspace.dailyLimitPerAccount } },
  );
  return workspace;
}
