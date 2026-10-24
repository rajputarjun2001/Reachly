import { Router } from "express";
import * as analytics from "../domain/analytics";
import * as blacklist from "../domain/blacklist";
import * as settings from "../domain/settings";
import * as authDomain from "../domain/auth";
import { ctxOf } from "../middleware/auth";
import { asyncHandler, unauthorized } from "../utils/errors";
import { created, ok, parsePagination } from "../utils/helpers";

const period = (q: unknown, fallback: string) => (typeof q === "string" && q ? q : fallback);

export const analyticsRouter = Router();
analyticsRouter.get("/overview", asyncHandler(async (req, res) => ok(res, await analytics.overview(ctxOf(req), period(req.query.period, "30d")))));
analyticsRouter.get("/daily", asyncHandler(async (req, res) => ok(res, await analytics.daily(ctxOf(req), period(req.query.period, "30d")))));
analyticsRouter.get("/campaigns", asyncHandler(async (req, res) => ok(res, await analytics.campaignPerformance(ctxOf(req)))));
analyticsRouter.get("/best-days", asyncHandler(async (req, res) => ok(res, await analytics.bestDays(ctxOf(req), period(req.query.period, "all")))));

export const blacklistRouter = Router();
blacklistRouter.post("/", asyncHandler(async (req, res) => created(res, await blacklist.addEntry(ctxOf(req), req.body || {}), "Added to blacklist")));
blacklistRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    ok(res, await blacklist.listEntries(ctxOf(req), { type, search, page, limit }));
  }),
);
blacklistRouter.delete("/:id", asyncHandler(async (req, res) => ok(res, await blacklist.removeEntry(ctxOf(req), req.params.id), "Removed from blacklist")));

export const settingsRouter = Router();
settingsRouter.patch("/workspace", asyncHandler(async (req, res) => ok(res, await settings.updateWorkspace(ctxOf(req), req.body || {}), "Workspace settings updated")));
settingsRouter.patch(
  "/profile",
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    ok(res, await authDomain.updateProfile(req.session, req.body || {}), "Profile updated");
  }),
);
settingsRouter.post(
  "/change-password",
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    await authDomain.changePassword(req.session, req.body || {});
    ok(res, null, "Password changed");
  }),
);
