import { Queue } from "bullmq";
import { getRedis } from "../../config/redis";
import { QUEUE_NAMES } from "./queueNames";

export type Queues = {
  connectionQueue: Queue;
  messageQueue: Queue;
  inboxPollQueue: Queue;
  /** Cron-style jobs: daily scheduling and health checks. */
  maintenanceQueue: Queue;
};

type GlobalWithQueues = typeof globalThis & { __reachlyQueues?: Queues };
const g = globalThis as GlobalWithQueues;

const defaultJobOptions = { removeOnComplete: 100, removeOnFail: 50 };

/** Created lazily so importing this module (e.g. from Next.js server code) never touches Redis. */
export function getQueues(): Queues {
  if (!g.__reachlyQueues) {
    const connection = getRedis();
    const make = (name: string) => {
      const q = new Queue(name, { connection, defaultJobOptions });
      // The shared connection already logs Redis errors.
      q.on("error", () => undefined);
      return q;
    };
    g.__reachlyQueues = {
      connectionQueue: make(QUEUE_NAMES.connection),
      messageQueue: make(QUEUE_NAMES.message),
      inboxPollQueue: make(QUEUE_NAMES.inboxPoll),
      maintenanceQueue: make(QUEUE_NAMES.maintenance),
    };
  }
  return g.__reachlyQueues;
}

export async function closeQueues(): Promise<void> {
  const queues = g.__reachlyQueues;
  if (!queues) return;
  g.__reachlyQueues = undefined;
  await Promise.all(Object.values(queues).map((q) => q.close()));
}
