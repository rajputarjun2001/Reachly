import { afterEach, describe, expect, it } from "vitest";
import { env } from "../config/env";

describe("redis env parsing", () => {
  const keys = ["REDIS_URL", "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD", "REDIS_TLS"] as const;
  const prior: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const k of keys) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
  });

  function setEnv(patch: Partial<Record<(typeof keys)[number], string>>) {
    for (const k of keys) prior[k] = process.env[k];
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, patch);
  }

  it("strips redis:// prefix mistakenly pasted into REDIS_HOST", () => {
    setEnv({ REDIS_HOST: "redis://red-abc123xyz" });
    expect(env.redisHost).toBe("red-abc123xyz");
    expect(env.redisPort).toBe(6379);
  });

  it("parses REDIS_URL", () => {
    setEnv({ REDIS_URL: "redis://:secret@red-host.example:6380" });
    expect(env.redisHost).toBe("red-host.example");
    expect(env.redisPort).toBe(6380);
    expect(env.redisPassword).toBe("secret");
  });
});
