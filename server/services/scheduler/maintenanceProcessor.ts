import { Worker } from "bullmq";
import type { Types } from "mongoose";
import { LinkedInAccount, type LinkedInAccountDoc } from "../../models";
import { getRedis } from "../../config/redis";
import { QUEUE_NAMES } from "./queueNames";
import { getQueues } from "./queues";
import * as linkedinActions from "../playwright/linkedinActions";
import { loadAccountWithSecrets, runWithSession } from "../accountSession";
import { logEvent } from "../events";
import { startAllActiveCampaigns } from "./dailyScheduler";
import type { JobLike } from "./jobTypes";

const { ERRORS } = linkedinActions;

export async function checkAccountHealth(account: LinkedInAccountDoc) {
  const result = await runWithSession(account, async (cookies, opts) => {
    const res = await linkedinActions.verifyCookies(cookies, opts);
    if (res.valid) return { success: true };
    return { success: false, error: res.error || ERRORS.SESSION_EXPIRED };
  });
  const refreshed = Boolean(result.refreshed);

  const lastHealthCheck = new Date();
  await LinkedInAccount.updateOne({ _id: account._id }, { $set: { lastHealthCheck } });
  account.lastHealthCheck = lastHealthCheck;
  await logEvent({
    workspaceId: account.workspaceId,
    linkedinAccountId: account._id,
    eventType: "health_check",
    payload: { valid: Boolean(result.success), flagged: Boolean(result.flagged), error: result.error, refreshed },
  });
  return { accountId: account._id, valid: Boolean(result.success), flagged: Boolean(result.flagged) };
}

export async function runHealthChecks() {
  const accounts = await LinkedInAccount.find({ status: "active" }).select("_id");
  const results: { accountId: Types.ObjectId; valid?: boolean; flagged?: boolean; error?: string }[] = [];
  for (const { _id } of accounts) {
    try {
      const account = await loadAccountWithSecrets(_id);
      if (account) results.push(await checkAccountHealth(account));
    } catch (err) {
      results.push({ accountId: _id, error: (err as Error).message });
    }
  }
  return results;
}

const HANDLERS: Record<string, () => Promise<unknown>> = {
  "daily-schedule": () => startAllActiveCampaigns(),
  "health-check": () => runHealthChecks(),
};

export async function processMaintenanceJob(job: JobLike<unknown>) {
  const handler = job.name ? HANDLERS[job.name] : undefined;
  if (!handler) throw new Error(`Unknown maintenance job: ${job.name}`);
  return handler();
}

export async function registerRepeatableJobs() {
  const q = getQueues().maintenanceQueue;
  // Hourly so every workspace timezone gets scheduled shortly after its local day starts;
  // scheduling itself is idempotent per campaign and local day.
  await q.upsertJobScheduler("daily-schedule", { pattern: "5 * * * *", tz: "UTC" }, { name: "daily-schedule" });
  await q.upsertJobScheduler("health-check", { every: 30 * 60 * 1000 }, { name: "health-check" });
  await q.removeJobScheduler("reset-daily-counts").catch(() => undefined);
}

export function createMaintenanceWorker() {
  return new Worker(QUEUE_NAMES.maintenance, processMaintenanceJob, {
    connection: getRedis(),
    concurrency: 1,
  });
}
