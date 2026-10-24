import { afterEach, describe, expect, it } from "vitest";
import { getBackendConfigError, isBackendConfigured } from "./env";

const KEYS = ["MONGO_URI", "JWT_SECRET", "ENCRYPTION_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

describe("env", () => {
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("reports unconfigured when vars are missing", () => {
    for (const k of KEYS) delete process.env[k];
    expect(isBackendConfigured()).toBe(false);
    expect(getBackendConfigError()).toMatch(/MONGO_URI, JWT_SECRET, ENCRYPTION_KEY/);
  });

  it("validates key formats", () => {
    process.env.MONGO_URI = "mongodb://localhost:27017/reachly";
    process.env.JWT_SECRET = "short";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    expect(getBackendConfigError()).toMatch(/JWT_SECRET/);
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.ENCRYPTION_KEY = "nothex";
    expect(getBackendConfigError()).toMatch(/ENCRYPTION_KEY/);
  });

  it("accepts a complete configuration", () => {
    process.env.MONGO_URI = "mongodb://localhost:27017/reachly";
    process.env.JWT_SECRET = "x".repeat(32);
    process.env.ENCRYPTION_KEY = "ab".repeat(32);
    expect(isBackendConfigured()).toBe(true);
    expect(getBackendConfigError()).toBeNull();
  });
});
