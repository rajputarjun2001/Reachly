import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, createWorkspaceFixture, request } from "./factory";
import { env } from "../config/env";
import { LinkedInAccount } from "../models";
import * as li from "../services/playwright/linkedinActions";
import { _clearBrowserConnectSessions } from "../services/playwright/browserConnectSessions";

vi.mock("../services/scheduler/queues");
vi.mock("../services/proxyCheck", () => ({ checkProxy: vi.fn(async () => undefined) }));
vi.mock("../services/playwright/linkedinActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/playwright/linkedinActions")>();
  return {
    ...actual,
    openManualLoginBrowser: vi.fn(),
    closeManualLoginBrowser: vi.fn(async () => undefined),
    hasLinkedInSession: vi.fn(() => false),
    captureLoginFrame: vi.fn(),
    verifyCookies: vi.fn(async () => ({ valid: true })),
    fetchOwnProfile: vi.fn(async () => ({ fullName: "Li User", headline: "", profileUrl: "" })),
  };
});

useTestDb();

const openManualLoginBrowser = vi.mocked(li.openManualLoginBrowser);
const hasLinkedInSession = vi.mocked(li.hasLinkedInSession);
const captureLoginFrame = vi.mocked(li.captureLoginFrame);

const SESSION_COOKIES = [
  { name: "li_at", value: "tok", domain: ".www.linkedin.com", path: "/" },
  { name: "JSESSIONID", value: '"ajax:1"', domain: ".www.linkedin.com", path: "/" },
];

/** Stand-in for the live Playwright session: records what the user's input did to the page. */
function fakeSession() {
  const calls: unknown[][] = [];
  const page = {
    url: () => "https://www.linkedin.com/login",
    on: vi.fn(),
    off: vi.fn(),
    viewportSize: () => li.REMOTE_LOGIN_VIEWPORT,
    mouse: {
      click: vi.fn(async (...a: unknown[]) => void calls.push(["click", ...a])),
      wheel: vi.fn(async (...a: unknown[]) => void calls.push(["wheel", ...a])),
    },
    keyboard: {
      type: vi.fn(async (text: string) => void calls.push(["type", text])),
      press: vi.fn(async (key: string) => void calls.push(["press", key])),
    },
  };
  return { session: { browser: { close: vi.fn() }, context: { cookies: vi.fn(async () => SESSION_COOKIES) }, page }, calls };
}

type Auth = { Authorization: string };
const start = (auth: Auth, body: Record<string, unknown> = {}) =>
  request(app).post("/api/accounts/connect/browser").set(auth).send({ linkedinEmail: "remote@li.com", ...body });

beforeEach(() => {
  vi.clearAllMocks();
  _clearBrowserConnectSessions();
  hasLinkedInSession.mockReturnValue(false);
});

afterEach(() => {
  _clearBrowserConnectSessions();
  vi.unstubAllEnvs();
});

describe("browserConnectMode", () => {
  it("streams in production, opens a window in development, and can be overridden or turned off", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(env.browserConnectMode).toBe("remote");
    vi.stubEnv("NODE_ENV", "development");
    expect(env.browserConnectMode).toBe("window");
    vi.stubEnv("BROWSER_CONNECT_MODE", "remote");
    expect(env.browserConnectMode).toBe("remote");
    vi.stubEnv("BROWSER_CONNECT_MODE", "");
    vi.stubEnv("BROWSER_CONNECT_ENABLED", "false");
    expect(env.browserConnectMode).toBe("off");
    expect(env.browserConnectEnabled).toBe(false);
  });
});

describe("streamed sign-in over the API", () => {
  beforeEach(() => {
    vi.stubEnv("BROWSER_CONNECT_MODE", "remote");
  });

  it("starts through the account proxy, serves frames, forwards input, and connects the account", async () => {
    const fx = await createWorkspaceFixture({ timezone: "Asia/Kolkata" });
    const { session, calls } = fakeSession();
    openManualLoginBrowser.mockResolvedValue(session as never);

    const started = await start(fx.auth, { proxyUrl: "gate.example.com:7000:user:secret" });
    expect(started.status).toBe(200);
    expect(started.body.data).toMatchObject({ status: "pending", mode: "remote" });
    expect(openManualLoginBrowser).toHaveBeenCalledWith({
      wsEndpoint: undefined,
      proxy: { server: "http://gate.example.com:7000", username: "user", password: "secret" },
      timezoneId: "Asia/Kolkata",
      remote: true,
    });
    const base = `/api/accounts/connect/browser/${started.body.data.sessionId}`;

    captureLoginFrame.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    const frame = await request(app).get(`${base}/frame`).set(fx.auth);
    expect(frame.status).toBe(200);
    expect(frame.headers["content-type"]).toBe("image/jpeg");
    expect(frame.headers["cache-control"]).toBe("no-store");
    expect(Buffer.from(frame.body as Buffer).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));

    const input = (body: unknown) => request(app).post(`${base}/input`).set(fx.auth).send(body as object);
    expect((await input({ type: "click", x: 300.4, y: 5000 })).status).toBe(200);
    expect((await input({ type: "type", text: "me@x.com" })).status).toBe(200);
    expect((await input({ type: "scroll", deltaY: 99999 })).status).toBe(200);
    expect(calls).toEqual([
      ["click", 300.4, li.REMOTE_LOGIN_VIEWPORT.height], // clamped to the page
      ["type", "me@x.com"],
      ["wheel", 0, 2000],
    ]);

    // Pressing Enter signs the user in: the account is created without waiting for the next poll.
    hasLinkedInSession.mockReturnValue(true);
    expect((await input({ type: "key", key: "Enter" })).status).toBe(200);
    await vi.waitFor(async () => {
      const status = await request(app).get(base).set(fx.auth);
      expect(status.body.data.error).toBeUndefined();
      expect(status.body.data.status).toBe("success");
    });
    const account = await LinkedInAccount.findOne({ linkedinEmail: "remote@li.com" });
    expect(account?.status).toBe("active");
    expect(account?.proxyHost).toBe("gate.example.com:7000");
    expect((await request(app).get(`${base}/frame`).set(fx.auth)).status).toBe(404);
  });

  it("a session LinkedIn then rejects leaves nothing behind, so the user can retry", async () => {
    const fx = await createWorkspaceFixture();
    openManualLoginBrowser.mockResolvedValue(fakeSession().session as never);
    vi.mocked(li.verifyCookies).mockResolvedValueOnce({ valid: false });
    hasLinkedInSession.mockReturnValue(true);
    const started = await start(fx.auth);
    const base = `/api/accounts/connect/browser/${started.body.data.sessionId}`;
    await vi.waitFor(async () => {
      expect((await request(app).get(base).set(fx.auth)).body.data.status).toBe("failed");
    });
    expect(await LinkedInAccount.countDocuments()).toBe(0);

    openManualLoginBrowser.mockResolvedValue(fakeSession().session as never);
    const again = await start(fx.auth);
    expect(again.status).toBe(200);
    await vi.waitFor(async () => {
      const status = await request(app).get(`/api/accounts/connect/browser/${again.body.data.sessionId}`).set(fx.auth);
      expect(status.body.data.status).toBe("success");
    });
  });

  it("rejects input the sign-in page should never receive", async () => {
    const fx = await createWorkspaceFixture();
    const { session, calls } = fakeSession();
    openManualLoginBrowser.mockResolvedValue(session as never);
    const base = `/api/accounts/connect/browser/${(await start(fx.auth)).body.data.sessionId}`;
    const input = (body: unknown) => request(app).post(`${base}/input`).set(fx.auth).send(body as object);

    for (const bad of [
      { type: "key", key: "F12" },
      { type: "key", key: "Control+L" },
      { type: "type", text: "" },
      { type: "type", text: "x".repeat(501) },
      { type: "click", x: "left", y: 1 },
      { type: "navigate", url: "https://example.com" },
      {},
    ]) {
      expect((await input(bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("hides the session from other workspaces and from signed-out callers", async () => {
    const fx = await createWorkspaceFixture();
    openManualLoginBrowser.mockResolvedValue(fakeSession().session as never);
    const base = `/api/accounts/connect/browser/${(await start(fx.auth)).body.data.sessionId}`;
    const other = await createWorkspaceFixture();
    expect((await request(app).get(`${base}/frame`).set(other.auth)).status).toBe(404);
    expect((await request(app).post(`${base}/input`).set(other.auth).send({ type: "key", key: "Enter" })).status).toBe(404);
    expect((await request(app).get(`${base}/frame`)).status).toBe(401);
    expect(captureLoginFrame).not.toHaveBeenCalled();
  });

  it("explains a server that cannot start its browser, and refuses when turned off", async () => {
    const fx = await createWorkspaceFixture();
    openManualLoginBrowser.mockRejectedValueOnce(new Error("browserType.launch: Executable doesn't exist at /x/chrome"));
    const failed = await start(fx.auth);
    expect(failed.status).toBe(422);
    expect(failed.body.error).toMatch(/server could not start its browser/);
    expect(failed.body.error).not.toMatch(/npm run dev/);

    vi.stubEnv("BROWSER_CONNECT_MODE", "off");
    const off = await start(fx.auth);
    expect(off.status).toBe(422);
    expect(off.body.error).toMatch(/turned off/);
  });
});

describe("sendLoginInput", () => {
  it("only presses keys a sign-in form needs", async () => {
    const { session, calls } = fakeSession();
    await li.sendLoginInput(session as never, { type: "key", key: "Tab" });
    await expect(li.sendLoginInput(session as never, { type: "key", key: "F5" })).rejects.toThrow("INVALID_INPUT");
    await expect(li.sendLoginInput(session as never, { type: "click", x: Number.NaN, y: 1 })).rejects.toThrow("INVALID_INPUT");
    expect(calls).toEqual([["press", "Tab"]]);
  });
});
