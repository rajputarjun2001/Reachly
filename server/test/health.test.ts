import { afterEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, request } from "./factory";
import * as redis from "../config/redis";

useTestDb();

describe("GET /api/health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok when Mongo is connected and Redis pings", async () => {
    vi.spyOn(redis, "pingRedis").mockResolvedValue(true);
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: "ok",
      backendConfigured: true,
      mongo: "up",
      redis: "up",
      workersEnabled: true,
    });
    expect(res.body.data.configError).toBeNull();
  });

  it("returns 503 when Redis is down but workers are enabled", async () => {
    vi.spyOn(redis, "pingRedis").mockResolvedValue(false);
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.data).toMatchObject({ status: "degraded", redis: "down", mongo: "up" });
  });
});
