import { Router } from "express";
import multer from "multer";
import * as leads from "../domain/leads";
import { ctxOf } from "../middleware/auth";
import { asyncHandler, unprocessable } from "../utils/errors";
import { created, ok, parsePagination } from "../utils/helpers";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const okType = /csv|text\/plain|application\/vnd\.ms-excel/i.test(file.mimetype) || /\.csv$/i.test(file.originalname);
    if (okType) cb(null, true);
    else cb(unprocessable("Only CSV files are accepted"));
  },
});

export const leadsRouter = Router();

leadsRouter.post(
  "/lists",
  asyncHandler(async (req, res) => created(res, await leads.createList(ctxOf(req), req.body || {}), "Lead list created")),
);

leadsRouter.get(
  "/lists",
  asyncHandler(async (req, res) => ok(res, await leads.listLists(ctxOf(req)))),
);

leadsRouter.patch(
  "/lists/:id",
  asyncHandler(async (req, res) => ok(res, await leads.renameList(ctxOf(req), req.params.id, req.body?.name), "Lead list renamed")),
);

leadsRouter.post(
  "/lists/:id/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => ok(res, await leads.importCsv(ctxOf(req), req.params.id, req.file?.buffer), "CSV processed")),
);

leadsRouter.get(
  "/lists/:id/leads",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    ok(res, await leads.listLeads(ctxOf(req), req.params.id, { page, limit, status, search }));
  }),
);

leadsRouter.delete(
  "/lists/:id",
  asyncHandler(async (req, res) => ok(res, await leads.deleteList(ctxOf(req), req.params.id), "Lead list deleted")),
);
