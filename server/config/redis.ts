import { Redis } from "ioredis";
import { env } from "./env";

type GlobalWithRedis = typeof globalThis & { __reachlyRedis?: Redis };
const g = globalThis as GlobalWithRedis;

/** Shared connection; BullMQ workers require maxRetriesPerRequest: null. */
export function getRedis(): Redis {
  if (!g.__reachlyRedis) {
    const connection = new Redis({
      host: env.redisHost,
      port: env.redisPort,
      maxRetriesPerRequest: null,
    });
    connection.on("error", (err: Error & { code?: string }) => {
      console.error("[redis]", err.message || err.code || String(err));
    });
    g.__reachlyRedis = connection;
  }
  return g.__reachlyRedis;
}

export async function closeRedis(): Promise<void> {
  if (g.__reachlyRedis) {
    await g.__reachlyRedis.quit().catch(() => undefined);
    g.__reachlyRedis = undefined;
  }
}

/** Returns true when Redis answers PING (used by /api/health). */
export async function pingRedis(timeoutMs = 2000): Promise<boolean> {
  const redis = getRedis();
  try {
    const result = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return result === "PONG";
  } catch {
    return false;
  }
}
