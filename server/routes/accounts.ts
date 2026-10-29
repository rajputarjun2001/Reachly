import { Router } from "express";
import * as accounts from "../domain/accounts";
import { ctxOf } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import { created, ok } from "../utils/helpers";

export const accountsRouter = Router();

accountsRouter.post(
  "/",
  asyncHandler(async (req, res) => created(res, await accounts.connectAccount(ctxOf(req), req.body || {}), "LinkedIn account connected")),
);

accountsRouter.post(
  "/connect/browser",
  asyncHandler(async (req, res) => ok(res, await accounts.startBrowserConnect(ctxOf(req), req.body || {}), "Browser sign-in started")),
);

accountsRouter.get(
  "/connect/browser/:sessionId",
  asyncHandler(async (req, res) => ok(res, accounts.browserConnectStatus(ctxOf(req), req.params.sessionId))),
);

accountsRouter.delete(
  "/connect/browser/:sessionId",
  asyncHandler(async (req, res) => ok(res, await accounts.cancelBrowserConnect(ctxOf(req), req.params.sessionId), "Browser sign-in cancelled")),
);

accountsRouter.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await accounts.listAccounts(ctxOf(req)))),
);

accountsRouter.get(
  "/:id/status",
  asyncHandler(async (req, res) => ok(res, await accounts.accountStatus(ctxOf(req), req.params.id))),
);

accountsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => ok(res, await accounts.updateAccount(ctxOf(req), req.params.id, req.body || {}), "LinkedIn account updated")),
);

accountsRouter.post(
  "/:id/reconnect",
  asyncHandler(async (req, res) =>
    ok(res, await accounts.reconnectAccount(ctxOf(req), req.params.id, req.body || {}), "LinkedIn account reconnected"),
  ),
);

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => ok(res, await accounts.removeAccount(ctxOf(req), req.params.id), "LinkedIn account removed")),
);
