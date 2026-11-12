const read = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

type RedisResolved = {
  host: string;
  port: number;
  password?: string;
  tls: boolean;
};

function parseRedisUrl(raw: string): RedisResolved | null {
  try {
    const normalized = raw.includes("://") ? raw : `redis://${raw}`;
    const url = new URL(normalized);
    if (url.protocol !== "redis:" && url.protocol !== "rediss:") return null;
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      tls: url.protocol === "rediss:",
    };
  } catch {
    return null;
  }
}

/** Accepts hostname only, host:port, or full redis:// / rediss:// URLs (common Render copy-paste mistakes). */
function resolveRedis(): RedisResolved {
  const fromUrl = read("REDIS_URL");
  if (fromUrl) {
    const parsed = parseRedisUrl(fromUrl);
    if (parsed) return parsed;
  }

  let host = read("REDIS_HOST") || "localhost";
  let port = Number(read("REDIS_PORT")) || 6379;
  let password = read("REDIS_PASSWORD");
  let tls = read("REDIS_TLS") === "true";

  if (host.includes("://") || /^rediss?:\/\//i.test(host) || host.startsWith("redis://")) {
    const parsed = parseRedisUrl(host);
    if (parsed) {
      host = parsed.host;
      if (!read("REDIS_PORT")) port = parsed.port;
      if (!password && parsed.password) password = parsed.password;
      if (!read("REDIS_TLS") && parsed.tls) tls = true;
    }
  } else {
    host = host.replace(/^rediss?:\/\//i, "");
    const at = host.lastIndexOf("@");
    if (at >= 0) host = host.slice(at + 1);
    const portMatch = host.match(/^(.+):(\d+)$/);
    if (portMatch && !read("REDIS_PORT")) {
      host = portMatch[1];
      port = Number(portMatch[2]);
    }
  }

  return { host, port, password, tls };
}

let cachedRedis: RedisResolved | undefined;
function redisConfig(): RedisResolved {
  if (process.env.NODE_ENV === "test") return resolveRedis();
  if (!cachedRedis) cachedRedis = resolveRedis();
  return cachedRedis;
}

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
    return redisConfig().host;
  },
  get redisPort() {
    return redisConfig().port;
  },
  get redisPassword() {
    return redisConfig().password;
  },
  get redisTls() {
    return redisConfig().tls;
  },
  /** Interactive Chromium window for LinkedIn (local dev). Not usable on typical cloud hosts without a remote browser product. */
  get browserConnectEnabled() {
    if (read("BROWSER_CONNECT_ENABLED") === "true") return true;
    if (read("BROWSER_CONNECT_ENABLED") === "false") return false;
    return (process.env.NODE_ENV || "development") !== "production";
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
  get linkedinClientId() {
    return read("LINKEDIN_CLIENT_ID");
  },
  get linkedinClientSecret() {
    return read("LINKEDIN_CLIENT_SECRET");
  },
  get linkedinOAuthRedirectUri() {
    const explicit = read("LINKEDIN_OAUTH_REDIRECT_URI");
    if (explicit) return explicit.replace(/\/$/, "");
    return `${env.siteUrl}/auth/linkedin/callback`;
  },
  get linkedinOAuthConfigured() {
    return Boolean(env.linkedinClientId && env.linkedinClientSecret);
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
