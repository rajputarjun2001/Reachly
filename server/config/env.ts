const read = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const env = {
  get nodeEnv() {
    return process.env.NODE_ENV || "development";
  },
  get isProduction() {
    return env.nodeEnv === "production";
  },
  get isTest() {
    return env.nodeEnv === "test";
  },
  get port() {
    return Number(read("PORT")) || 3000;
  },
  get mongoUri() {
    return read("MONGO_URI");
  },
  get redisHost() {
    return read("REDIS_HOST") || "localhost";
  },
  get redisPort() {
    return Number(read("REDIS_PORT")) || 6379;
  },
  get redisPassword() {
    return read("REDIS_PASSWORD");
  },
  /** Set REDIS_TLS=true when the provider requires TLS (e.g. some managed Redis URLs). */
  get redisTls() {
    return read("REDIS_TLS") === "true";
  },
  get jwtSecret() {
    return read("JWT_SECRET");
  },
  get jwtExpiresIn() {
    return read("JWT_EXPIRES_IN") || "30d";
  },
  get encryptionKey() {
    return read("ENCRYPTION_KEY");
  },
  get siteUrl() {
    return (read("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000").replace(/\/$/, "");
  },
  get workersEnabled() {
    return read("WORKERS_ENABLED") !== "false";
  },
  get dockerEnabled() {
    return read("DOCKER_ENABLED") === "true";
  },
  get dockerNetwork() {
    return read("DOCKER_NETWORK") || "reachly-net";
  },
  get dockerHostAddress() {
    return read("DOCKER_HOST_ADDRESS") || "127.0.0.1";
  },
};

/** Returns a human-readable problem with the backend configuration, or null when it is usable. */
export function getBackendConfigError(): string | null {
  const missing = ["MONGO_URI", "JWT_SECRET", "ENCRYPTION_KEY"].filter((k) => !read(k));
  if (missing.length) return `Missing environment variables: ${missing.join(", ")}.`;
  if (!/^[0-9a-fA-F]{64}$/.test(read("ENCRYPTION_KEY")!)) {
    return "ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.";
  }
  if (read("JWT_SECRET")!.length < 32) return "JWT_SECRET must be at least 32 characters.";
  return null;
}

export function isBackendConfigured(): boolean {
  return getBackendConfigError() === null;
}
