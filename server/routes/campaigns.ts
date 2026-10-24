import { Router } from "express";
import * as campaigns from "../domain/campaigns";
import { ctxOf } from "../middleware/auth";
import { asyncHandler, badRequest } from "../utils/errors";
import { created, ok } from "../utils/helpers";

export const campaignsRouter = Router();

campaignsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!body.linkedinAccountId) throw badRequest("linkedinAccountId is required");
    if (!body.leadListId) throw badRequest("leadListId is required");
    created(res, await campaigns.createCampaign(ctxOf(req), body), "Campaign created");
  }),
);

campaignsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    ok(res, await campaigns.listCampaigns(ctxOf(req), { status }));
  }),
);

campaignsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => ok(res, await campaigns.campaignDetail(ctxOf(req), req.params.id))),
);

campaignsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => ok(res, await campaigns.updateCampaign(ctxOf(req), req.params.id, req.body || {}), "Campaign updated")),
);

campaignsRouter.post(
  "/:id/launch",
  asyncHandler(async (req, res) => ok(res, await campaigns.launchCampaign(ctxOf(req), req.params.id), "Campaign launched")),
);

campaignsRouter.post(
  "/:id/pause",
  asyncHandler(async (req, res) => ok(res, await campaigns.pauseCampaign(ctxOf(req), req.params.id), "Campaign paused")),
);

campaignsRouter.post(
  "/:id/resume",
  asyncHandler(async (req, res) => ok(res, await campaigns.resumeCampaign(ctxOf(req), req.params.id), "Campaign resumed")),
);

campaignsRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => ok(res, await campaigns.cancelCampaign(ctxOf(req), req.params.id), "Campaign cancelled")),
);

campaignsRouter.post(
  "/:id/archive",
  asyncHandler(async (req, res) => ok(res, await campaigns.archiveCampaign(ctxOf(req), req.params.id), "Campaign archived")),
);

campaignsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => ok(res, await campaigns.deleteCampaign(ctxOf(req), req.params.id), "Campaign deleted")),
);
