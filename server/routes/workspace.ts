import { Router } from "express";
import * as authDomain from "../domain/auth";
import * as settings from "../domain/settings";
import { ctxOf } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import { created, ok } from "../utils/helpers";

export const workspaceRouter = Router();

workspaceRouter.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await settings.getWorkspace(ctxOf(req)))),
);

workspaceRouter.post(
  "/invite",
  asyncHandler(async (req, res) => {
    created(res, await authDomain.inviteMember(ctxOf(req), req.body || {}), "Invitation created");
  }),
);

workspaceRouter.get(
  "/members",
  asyncHandler(async (req, res) => ok(res, await authDomain.listMembers(ctxOf(req)))),
);

workspaceRouter.delete(
  "/members/:userId",
  asyncHandler(async (req, res) => ok(res, await authDomain.removeMember(ctxOf(req), req.params.userId), "Member removed")),
);
