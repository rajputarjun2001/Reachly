import { Router } from "express";
import * as authDomain from "../domain/auth";
import { authenticate } from "../middleware/auth";
import { asyncHandler, unauthorized } from "../utils/errors";
import { created, ok } from "../utils/helpers";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { user, workspace } = await authDomain.registerWithWorkspace(req.body || {});
    created(res, { token: await authDomain.issueToken(user), user, workspace }, "Account created");
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const user = await authDomain.authenticate(req.body?.email, req.body?.password);
    const { workspace } = await authDomain.getMe(String(user._id));
    ok(res, { token: await authDomain.issueToken(user), user, workspace }, "Logged in");
  }),
);

authRouter.post(
  "/accept-invite",
  asyncHandler(async (req, res) => {
    const { user, workspace } = await authDomain.acceptInvite(req.body || {});
    ok(res, { token: await authDomain.issueToken(user), user, workspace }, "Invite accepted");
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    ok(res, await authDomain.getMe(req.session.userId));
  }),
);

authRouter.post(
  "/workspace",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    const { user, workspace } = await authDomain.createWorkspaceForUser(req.session.userId, { name: req.body?.name });
    created(res, { token: await authDomain.issueToken(user), user, workspace }, "Workspace created");
  }),
);
