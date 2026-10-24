import { Router } from "express";
import * as unibox from "../domain/unibox";
import { ctxOf } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import { ok, parsePagination } from "../utils/helpers";

export const uniboxRouter = Router();

uniboxRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
    const filter = (typeof req.query.filter === "string" ? req.query.filter : "all") as unibox.ConversationListOptions["filter"];
    ok(res, await unibox.listConversations(ctxOf(req), { filter, page, limit }));
  }),
);

uniboxRouter.get(
  "/conversations/:id",
  asyncHandler(async (req, res) => ok(res, await unibox.conversationDetail(ctxOf(req), req.params.id))),
);

uniboxRouter.patch(
  "/conversations/:id/read",
  asyncHandler(async (req, res) => ok(res, await unibox.markRead(ctxOf(req), req.params.id), "Marked as read")),
);

uniboxRouter.post(
  "/conversations/:id/reply",
  asyncHandler(async (req, res) => ok(res, await unibox.reply(ctxOf(req), req.params.id, req.body?.message), "Reply sent")),
);
