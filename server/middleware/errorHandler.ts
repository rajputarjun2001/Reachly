import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { env } from "../config/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

type ErrorLike = Error & {
  status?: number;
  statusCode?: number;
  code?: number | string;
  keyValue?: Record<string, unknown>;
  type?: string;
};

/** Maps an error to an HTTP status and a user-safe message. Shared with Next.js server actions. */
export function describeError(err: unknown): { status: number; message: string } {
  const e = (err ?? {}) as ErrorLike;
  let status = e.status || e.statusCode || 500;
  let message = e.message || "Internal server error";

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = Object.values(err.errors)
      .map((x) => x.message)
      .join(", ");
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (e.code === 11000) {
    status = 409;
    message = `Duplicate value for ${Object.keys(e.keyValue || {}).join(", ") || "unique field"}`;
  } else if (err instanceof multer.MulterError) {
    status = err.code === "LIMIT_FILE_SIZE" ? 422 : 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 10MB)" : err.message;
  } else if (e.type === "entity.parse.failed") {
    status = 400;
    message = "Malformed JSON body";
  }

  if (status >= 500 && env.isProduction) message = "Internal server error";
  return { status, message };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { status, message } = describeError(err);
  if (status >= 500 && !env.isTest) console.error("[error]", err);
  const body: { error: string; stack?: string } = { error: message };
  if (!env.isProduction && status >= 500 && err instanceof Error && err.stack) body.stack = err.stack;
  res.status(status).json(body);
}
