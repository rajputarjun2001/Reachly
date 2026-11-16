import http from "http";
import https from "https";
import { unprocessable } from "../utils/errors";
import { proxyDisplayHost, type ProxySettings } from "../utils/proxy";

const TARGET = "www.linkedin.com:443";
export const PROXY_CHECK_FAILED = "PROXY_CHECK_FAILED";

/**
 * Opens (and immediately closes) a tunnel to LinkedIn through the proxy, so a wrong password or a dead
 * proxy is reported in plain words when it is saved, instead of as an opaque browser error at send time.
 * SOCKS proxies are not checked here; the browser reports those when it first uses them.
 */
export async function checkProxy(proxy: ProxySettings, timeoutMs = 15_000): Promise<void> {
  const url = new URL(proxy.server);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  const where = proxyDisplayHost(proxy);
  const headers: Record<string, string> = { Host: TARGET };
  if (proxy.username) {
    headers["Proxy-Authorization"] =
      "Basic " + Buffer.from(`${proxy.username}:${proxy.password ?? ""}`).toString("base64");
  }

  const status = await new Promise<number>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request({
      host: url.hostname.replace(/^\[|\]$/g, ""),
      port: Number(url.port),
      method: "CONNECT",
      path: TARGET,
      headers,
      timeout: timeoutMs,
    });
    request.once("connect", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    // A proxy that answers CONNECT with a normal response (some send the 407 this way).
    request.once("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    request.once("timeout", () => request.destroy(new Error("timeout")));
    request.once("error", reject);
    request.end();
  }).catch((err: Error) => {
    throw unprocessable(
      `Could not reach the proxy at ${where} (${err.message}). Check the host and port, and that the proxy plan is active.`,
      PROXY_CHECK_FAILED,
    );
  });

  if (status === 200) return;
  if (status === 407) {
    throw unprocessable(`The proxy at ${where} rejected the username or password.`, PROXY_CHECK_FAILED);
  }
  throw unprocessable(
    `The proxy at ${where} refused to connect to LinkedIn (HTTP ${status}). Some providers block LinkedIn on certain plans.`,
    PROXY_CHECK_FAILED,
  );
}
