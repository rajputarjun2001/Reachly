import "server-only";

import { connectDB } from "@server/config/db";
import { describeError } from "@server/middleware/errorHandler";

/** Ensures the shared mongoose connection is open before domain calls. */
export async function ensureDb() {
  await connectDB();
}

/** User-safe message for errors thrown by domain services (AppError, validation, duplicate keys). */
export function actionErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const { status, message } = describeError(err);
  if (status >= 500) {
    console.error("[action]", err);
    return status === 503 || status === 502 ? message : fallback;
  }
  return message;
}
