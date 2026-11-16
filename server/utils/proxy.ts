import { badRequest } from "./errors";

/** Shape Playwright accepts for `browser.newContext({ proxy })`. */
export type ProxySettings = { server: string; username?: string; password?: string };

const SCHEMES = new Set(["http", "https", "socks5"]);
const PROXY_HINT =
  "Use http://user:pass@host:port, host:port, or host:port:user:pass (the format most proxy providers show).";

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parses the proxy formats providers hand out into Playwright proxy settings.
 * Throws a 400 for anything that would silently fall back to a direct connection.
 */
export function parseProxyUrl(raw: unknown): ProxySettings {
  let text = String(raw ?? "").trim();
  if (!text) throw badRequest(`Proxy is empty. ${PROXY_HINT}`);

  let scheme = "http";
  const schemeMatch = text.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    text = text.slice(schemeMatch[0].length);
  }
  if (!SCHEMES.has(scheme)) throw badRequest(`Unsupported proxy type "${scheme}". ${PROXY_HINT}`);
  text = text.replace(/\/+$/, "");

  let username: string | undefined;
  let password: string | undefined;
  let hostPort = text;

  const HOST_PORT = /^(\[[0-9a-f:]+\]|[a-z0-9.-]+):(\d{1,5})$/i;
  const at = text.lastIndexOf("@");
  // Only treat "@" as the credentials separator when a host:port follows it; a password may contain "@".
  if (at >= 0 && HOST_PORT.test(text.slice(at + 1))) {
    const auth = text.slice(0, at);
    hostPort = text.slice(at + 1);
    const colon = auth.indexOf(":");
    username = decode(colon >= 0 ? auth.slice(0, colon) : auth);
    password = colon >= 0 ? decode(auth.slice(colon + 1)) : undefined;
  } else {
    // host:port:user:pass
    const parts = text.split(":");
    if (parts.length >= 4) {
      hostPort = `${parts[0]}:${parts[1]}`;
      username = parts[2];
      password = parts.slice(3).join(":");
    }
  }

  const match = hostPort.match(HOST_PORT);
  if (!match) throw badRequest(`Proxy needs a host and a port. ${PROXY_HINT}`);
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw badRequest("Proxy port must be between 1 and 65535.");
  if (username !== undefined && !username) throw badRequest(`Proxy username is empty. ${PROXY_HINT}`);
  if (scheme === "socks5" && username) {
    throw badRequest("Chromium cannot log in to a SOCKS5 proxy. Use the provider's HTTP endpoint instead.");
  }

  const settings: ProxySettings = { server: `${scheme}://${match[1].toLowerCase()}:${port}` };
  if (username) {
    settings.username = username;
    settings.password = password ?? "";
  }
  return settings;
}

/** Canonical URL (credentials included) for encrypted storage. */
export function proxyToUrl(proxy: ProxySettings): string {
  if (!proxy.username) return proxy.server;
  const [scheme, rest] = proxy.server.split("://");
  return `${scheme}://${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password ?? "")}@${rest}`;
}

/** host:port only, safe to show in the UI and logs. */
export function proxyDisplayHost(proxy: ProxySettings): string {
  return proxy.server.split("://")[1];
}
