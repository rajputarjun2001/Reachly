import type { Worker } from "bullmq";
import { createConnectionWorker } from "./connectionProcessor";
import { createMessageWorker } from "./messageProcessor";
import { createInboxWorker } from "./inboxProcessor";
import { createMaintenanceWorker, registerRepeatableJobs } from "./maintenanceProcessor";

let workers: Worker[] = [];
let workersReady = false;

export function areWorkersRunning(): boolean {
  return workersReady;
}

export async function startWorkers(): Promise<Worker[]> {
  workers = [createConnectionWorker(), createMessageWorker(), createInboxWorker(), createMaintenanceWorker()];
  for (const w of workers) {
    w.on("failed", (job, err) =>
      console.error(`[worker:${w.name}] job ${job?.id} (${job?.name}) failed: ${err.message}`),
    );
    w.on("error", (err) => console.error(`[worker:${w.name}]`, err.message));
  }
  await registerRepeatableJobs();
  workersReady = true;
  return workers;
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
  workersReady = false;
}
