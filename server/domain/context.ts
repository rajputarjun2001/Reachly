import mongoose, { Types } from "mongoose";
import { forbidden, unauthorized } from "../utils/errors";
import { assertObjectId } from "../utils/helpers";

/** Identity of the caller. workspaceId always comes from the verified session, never the request body. */
export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "member";
};

export function requireWorkspace(ctx: { userId: string; workspaceId: string | null; role: AuthContext["role"] }): AuthContext {
  if (!ctx.workspaceId) throw unauthorized("Create a workspace first");
  return ctx as AuthContext;
}

export function requireOwner(ctx: AuthContext, message = "Only the workspace owner can do this") {
  if (ctx.role !== "owner") throw forbidden(message);
}

export function oid(id: string | Types.ObjectId, label = "id"): Types.ObjectId {
  if (id instanceof Types.ObjectId) return id;
  assertObjectId(id, label);
  return new mongoose.Types.ObjectId(id);
}
