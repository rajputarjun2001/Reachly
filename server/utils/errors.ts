import type { NextFunction, Request, RequestHandler, Response } from "express";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    /** Machine-readable extras the client needs to continue (returned in the response body with `code`). */
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg = "Bad request") => new AppError(400, msg, "BAD_REQUEST");
export const unauthorized = (msg = "Unauthorized") => new AppError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "Forbidden") => new AppError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Not found") => new AppError(404, msg, "NOT_FOUND");
export const conflict = (msg = "Conflict") => new AppError(409, msg, "CONFLICT");
export const unprocessable = (msg = "Unprocessable entity", code = "UNPROCESSABLE") =>
  new AppError(422, msg, code);

export function isAppError(err: unknown): err is AppError {
  return err instanceof Error && err.name === "AppError" && typeof (err as AppError).status === "number";
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
