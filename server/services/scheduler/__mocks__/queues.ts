import { vi } from "vitest";
import { QUEUE_NAMES } from "../queueNames";

function fakeQueue(name: string) {
  return {
    name,
    add: vi.fn(async (jobName: string, data: unknown, opts?: { jobId?: string }) => ({
      id: opts?.jobId || `${name}-${Math.random()}`,
      name: jobName,
      data,
      opts,
    })),
    upsertJobScheduler: vi.fn(async () => ({})),
    removeJobScheduler: vi.fn(async () => true),
    close: vi.fn(async () => undefined),
  };
}

const queues = {
  connectionQueue: fakeQueue(QUEUE_NAMES.connection),
  messageQueue: fakeQueue(QUEUE_NAMES.message),
  inboxPollQueue: fakeQueue(QUEUE_NAMES.inboxPoll),
  maintenanceQueue: fakeQueue(QUEUE_NAMES.maintenance),
};

export type FakeQueues = typeof queues;
export const getQueues = vi.fn(() => queues);
export const closeQueues = vi.fn(async () => undefined);
