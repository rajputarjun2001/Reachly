import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import { env, getBackendConfigError, isBackendConfigured } from "./config/env";
import { pingRedis } from "./config/redis";
import { authenticate } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth";
import { workspaceRouter } from "./routes/workspace";
import { leadsRouter } from "./routes/leads";
import { campaignsRouter } from "./routes/campaigns";
import { accountsRouter } from "./routes/accounts";
import { uniboxRouter } from "./routes/unibox";
import { analyticsRouter, blacklistRouter, settingsRouter } from "./routes/misc";

/** REST API, mounted under /api by the custom server (or used standalone in tests). */
export function createApiApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.siteUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_req, res) => {
    const configured = isBackendConfigured();
    const configError = getBackendConfigError();
    const mongoOk = configured && mongoose.connection.readyState === 1;
    const redisOk = configured && env.workersEnabled ? await pingRedis() : configured ? true : false;
    const ok = !configured || (mongoOk && redisOk);
    res.status(ok ? 200 : 503).json({
      data: {
        status: ok ? "ok" : "degraded",
        uptime: process.uptime(),
        backendConfigured: configured,
        mongo: configured ? (mongoOk ? "up" : "down") : "skipped",
        redis: configured ? (env.workersEnabled ? (redisOk ? "up" : "down") : "workers_disabled") : "skipped",
        workersEnabled: env.workersEnabled,
        configError,
      },
      message: ok ? "OK" : "Service degraded",
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/workspace", authenticate, workspaceRouter);
  app.use("/api/leads", authenticate, leadsRouter);
  app.use("/api/campaigns", authenticate, campaignsRouter);
  app.use("/api/accounts", authenticate, accountsRouter);
  app.use("/api/unibox", authenticate, uniboxRouter);
  app.use("/api/analytics", authenticate, analyticsRouter);
  app.use("/api/blacklist", authenticate, blacklistRouter);
  app.use("/api/settings", authenticate, settingsRouter);

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
