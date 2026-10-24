import mongoose from "mongoose";
import type { Response } from "express";
import { badRequest } from "./errors";

export function assertObjectId(id: unknown, label = "id"): asserts id is string {
  if (typeof id !== "string" || !mongoose.isValidObjectId(id)) throw badRequest(`Invalid ${label}`);
}

export function parsePagination(
  query: { page?: unknown; limit?: unknown },
  { defaultLimit = 50, maxLimit = 200 } = {},
) {
  const page = Math.max(1, parseInt(String(query.page ?? ""), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(query.limit ?? ""), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export function ok(res: Response, data: unknown, message = "OK", status = 200) {
  return res.status(status).json({ data, message });
}

export function created(res: Response, data: unknown, message = "Created") {
  return ok(res, data, message, 201);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
