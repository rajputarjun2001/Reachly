/** Default maximum attempts per execution job. */
export const DEFAULT_JOB_MAX_ATTEMPTS = 3;

/** Retry backoff in milliseconds (attempt 1 → index 0, etc.). */
export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000] as const;

/** Maximum delay between steps (days). */
export const MAX_STEP_DELAY_DAYS = 365;

/** Worker label max length for claim RPC. */
export const WORKER_ID_MAX_LENGTH = 120;
