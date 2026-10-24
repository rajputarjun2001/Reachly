import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { env, getBackendConfigError } from "./server/config/env";
import { connectDB, disconnectDB } from "./server/config/db";
import { closeRedis } from "./server/config/redis";
import { createApiApp } from "./server/app";

/**
 * Single-process entry point: Next.js UI, the Express REST API under /api and (optionally)
 * the BullMQ workers. Set WORKERS_ENABLED=false to run workers in a separate process later.
 */
async function main() {
  const dev = process.env.NODE_ENV !== "production";
  const configError = getBackendConfigError();
  if (configError) {
    console.warn(`[reachly] Backend not configured: ${configError} The UI runs in demo mode.`);
  } else {
    await connectDB();
    console.log("[reachly] MongoDB connected");
  }

  const nextApp = next({ dev });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();
  const api = createApiApp();

  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/") || req.url === "/api") {
      api(req, res);
      return;
    }
    void handle(req, res);
  });

  let stopWorkers: (() => Promise<void>) | undefined;
  if (!configError && env.workersEnabled) {
    try {
      const workers = await import("./server/services/scheduler/workers");
      const scheduler = await import("./server/services/scheduler/dailyScheduler");
      await workers.startWorkers();
      stopWorkers = workers.stopWorkers;
      const summary = await scheduler.startAllActiveCampaigns();
      console.log(
        `[reachly] Workers started (${summary.campaigns.length} active campaigns, ${summary.inboxPolls} inbox polls)`,
      );
    } catch (err) {
      const message = (err as Error).message;
      console.error("[reachly] Workers failed to start (is Redis running?):", message);
      if (env.isProduction && env.workersEnabled) {
        console.error("[reachly] Refusing to run in production without BullMQ workers. Fix Redis or set WORKERS_ENABLED=false.");
        process.exit(1);
      }
    }
  }

  server.listen(env.port, () => {
    console.log(`[reachly] Ready on http://localhost:${env.port} (${dev ? "development" : "production"})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[reachly] ${signal} received, shutting down`);
    server.close();
    await stopWorkers?.().catch(() => undefined);
    const { closeQueues } = await import("./server/services/scheduler/queues");
    await closeQueues().catch(() => undefined);
    await closeRedis();
    await disconnectDB().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[reachly] Fatal startup error:", err);
  process.exit(1);
});
