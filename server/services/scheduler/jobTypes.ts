/** The subset of a BullMQ Job used by processors (lets tests pass plain objects). */
export type JobLike<T> = {
  name?: string;
  data: T;
  opts?: { attempts?: number };
  attemptsMade?: number;
};

export type ConnectionJobData = { leadId: string; campaignId: string; accountId: string };
export type MessageJobPayload = ConnectionJobData & { messageStep: number | string };
export type InboxJobData = { accountId: string };

export type JobOutcome = {
  sent?: boolean;
  skipped?: boolean;
  deferred?: boolean;
  reason?: string;
  delayMs?: number;
};
