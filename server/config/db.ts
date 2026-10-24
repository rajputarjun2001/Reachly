import mongoose from "mongoose";
import { env } from "./env";

type GlobalWithDb = typeof globalThis & { __reachlyDb?: Promise<typeof mongoose> };
const g = globalThis as GlobalWithDb;

/**
 * Connects once per process. Next.js server code and the custom server share the same
 * mongoose instance (it is an external package), so the promise is kept on globalThis.
 */
export async function connectDB(uri = env.mongoUri): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!uri) throw new Error("MONGO_URI is not configured");
  if (!g.__reachlyDb) {
    mongoose.set("strictQuery", true);
    g.__reachlyDb = mongoose.connect(uri).catch((err) => {
      g.__reachlyDb = undefined;
      throw err;
    });
  }
  await g.__reachlyDb;
  return mongoose;
}

export async function disconnectDB(): Promise<void> {
  g.__reachlyDb = undefined;
  await mongoose.disconnect();
}
