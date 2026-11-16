import http from "http";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it } from "vitest";
import { checkProxy } from "../services/proxyCheck";
import { parseProxyUrl } from "../utils/proxy";

const GOOD = "Basic " + Buffer.from("user:pass").toString("base64");
let server: http.Server | undefined;

/** A fake proxy: tunnels succeed with the right credentials, 407 otherwise; `refuse` forces a 403. */
async function fakeProxy({ refuse = false } = {}): Promise<{ port: number; targets: string[] }> {
  const targets: string[] = [];
  server = http.createServer();
  server.on("connect", (req, socket) => {
    targets.push(req.url || "");
    const status = refuse ? "403 Forbidden" : req.headers["proxy-authorization"] === GOOD ? "200 OK" : "407 Proxy Authentication Required";
    socket.end(`HTTP/1.1 ${status}\r\n\r\n`);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, targets };
}

afterEach(async () => {
  if (server?.listening) await new Promise((resolve) => server!.close(resolve));
  server = undefined;
});

describe("checkProxy", () => {
  it("passes when the proxy opens a tunnel to LinkedIn", async () => {
    const { port, targets } = await fakeProxy();
    await expect(checkProxy(parseProxyUrl(`http://user:pass@127.0.0.1:${port}`))).resolves.toBeUndefined();
    expect(targets).toEqual(["www.linkedin.com:443"]);
  });

  it("names a rejected username or password", async () => {
    const { port } = await fakeProxy();
    await expect(checkProxy(parseProxyUrl(`http://user:wrong@127.0.0.1:${port}`))).rejects.toThrow(
      /rejected the username or password/,
    );
  });

  it("reports a proxy that refuses LinkedIn", async () => {
    const { port } = await fakeProxy({ refuse: true });
    await expect(checkProxy(parseProxyUrl(`127.0.0.1:${port}:user:pass`))).rejects.toThrow(/HTTP 403/);
  });

  it("reports an unreachable proxy without leaking credentials", async () => {
    const { port } = await fakeProxy();
    await new Promise((resolve) => server!.close(resolve));
    const error = await checkProxy(parseProxyUrl(`http://user:pass@127.0.0.1:${port}`)).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/Could not reach the proxy at 127\.0\.0\.1/);
    expect((error as Error).message).not.toContain("pass");
  });

  it("does not probe SOCKS proxies", async () => {
    await expect(checkProxy(parseProxyUrl("socks5://127.0.0.1:1"))).resolves.toBeUndefined();
  });
});
