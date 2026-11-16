import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { createWorkspaceFixture } from "./factory";
import * as li from "../services/playwright/linkedinActions";
import {
  _clearBrowserConnectSessions,
  cancelBrowserConnectSession,
  captureBrowserConnectFrame,
  sendBrowserConnectInput,
  getBrowserConnectSession,
  startBrowserConnectSession,
} from "../services/playwright/browserConnectSessions";

vi.mock("../services/playwright/linkedinActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/playwright/linkedinActions")>();
  return {
    ...actual,
    openManualLoginBrowser: vi.fn(),
    closeManualLoginBrowser: vi.fn(),
    hasLinkedInSession: vi.fn(),
    captureLoginFrame: vi.fn(),
    sendLoginInput: vi.fn(),
  };
});

useTestDb();

const openManualLoginBrowser = vi.mocked(li.openManualLoginBrowser);
const closeManualLoginBrowser = vi.mocked(li.closeManualLoginBrowser);
const hasLinkedInSession = vi.mocked(li.hasLinkedInSession);
const captureLoginFrame = vi.mocked(li.captureLoginFrame);
const sendLoginInput = vi.mocked(li.sendLoginInput);

function fakePlaywright() {
  const listeners = new Map<string, Set<() => void>>();
  const cookies = vi.fn().mockResolvedValue([{ name: "li_at", value: "x" }]);
  const url = vi.fn().mockReturnValue("https://www.linkedin.com/feed/");
  const page = {
    url,
    on: vi.fn((event: string, fn: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: () => void) => {
      listeners.get(event)?.delete(fn);
    }),
  };
  return {
    browser: { close: vi.fn() },
    context: { cookies },
    page,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearBrowserConnectSessions();
  vi.useFakeTimers();
});

afterEach(() => {
  _clearBrowserConnectSessions();
  vi.useRealTimers();
});

describe("browserConnectSessions", () => {
  it("completes when LinkedIn session cookies appear", async () => {
    vi.useRealTimers();
    const fx = await createWorkspaceFixture();
    const pw = fakePlaywright();
    openManualLoginBrowser.mockResolvedValue(pw as never);
    hasLinkedInSession.mockReturnValueOnce(false).mockReturnValue(true);

    const onSuccess = vi.fn().mockResolvedValue("acc-1");
    const snap = await startBrowserConnectSession({
      workspaceId: String(fx.workspace._id),
      userId: String(fx.user._id),
      onSuccess,
    });
    expect(snap.status).toBe("pending");

    await new Promise((r) => setTimeout(r, 2500));

    const done = getBrowserConnectSession(String(fx.workspace._id), snap.sessionId);
    expect(done?.status).toBe("success");
    expect(done?.accountId).toBe("acc-1");
    expect(onSuccess).toHaveBeenCalled();
    expect(closeManualLoginBrowser).toHaveBeenCalled();
    vi.useFakeTimers();
  });

  it("completes immediately when the browser already lands on the feed", async () => {
    const fx = await createWorkspaceFixture();
    const pw = fakePlaywright();
    pw.page.url.mockReturnValue("https://www.linkedin.com/feed/");
    openManualLoginBrowser.mockResolvedValue(pw as never);
    hasLinkedInSession.mockReturnValue(true);
    const onSuccess = vi.fn().mockResolvedValue("acc-2");
    const snap = await startBrowserConnectSession({
      workspaceId: String(fx.workspace._id),
      userId: String(fx.user._id),
      onSuccess,
    });
    await Promise.resolve();
    const done = getBrowserConnectSession(String(fx.workspace._id), snap.sessionId);
    expect(done?.status).toBe("success");
    expect(onSuccess).toHaveBeenCalled();
  });

  it("can be cancelled while pending", async () => {
    const fx = await createWorkspaceFixture();
    openManualLoginBrowser.mockResolvedValue(fakePlaywright() as never);
    hasLinkedInSession.mockReturnValue(false);
    const snap = await startBrowserConnectSession({
      workspaceId: String(fx.workspace._id),
      userId: String(fx.user._id),
      onSuccess: vi.fn(),
    });
    expect(await cancelBrowserConnectSession(String(fx.workspace._id), snap.sessionId)).toBe(true);
    expect(getBrowserConnectSession(String(fx.workspace._id), snap.sessionId)).toBeNull();
  });
});

describe("remote (streamed) sign-in", () => {
  const PROXY = { server: "http://gate.example.com:7000" };

  async function startRemote() {
    const fx = await createWorkspaceFixture();
    const pw = fakePlaywright();
    openManualLoginBrowser.mockResolvedValue(pw as never);
    hasLinkedInSession.mockReturnValue(false);
    const onSuccess = vi.fn().mockResolvedValue("acc-remote");
    const snap = await startBrowserConnectSession({
      workspaceId: String(fx.workspace._id),
      userId: String(fx.user._id),
      mode: "remote",
      browser: { proxy: PROXY, timezoneId: "Asia/Kolkata" },
      onSuccess,
    });
    return { ws: String(fx.workspace._id), snap, pw, onSuccess };
  }

  it("opens a headless browser through the account proxy and reports the mode", async () => {
    const { snap } = await startRemote();
    expect(snap.mode).toBe("remote");
    expect(openManualLoginBrowser).toHaveBeenCalledWith({ proxy: PROXY, timezoneId: "Asia/Kolkata", remote: true });
  });

  it("window mode stays the default and has no frames or input", async () => {
    const fx = await createWorkspaceFixture();
    openManualLoginBrowser.mockResolvedValue(fakePlaywright() as never);
    hasLinkedInSession.mockReturnValue(false);
    const snap = await startBrowserConnectSession({
      workspaceId: String(fx.workspace._id),
      userId: String(fx.user._id),
      onSuccess: vi.fn(),
    });
    expect(snap.mode).toBe("window");
    expect(openManualLoginBrowser).toHaveBeenCalledWith({ remote: false });
    expect(await captureBrowserConnectFrame(String(fx.workspace._id), snap.sessionId)).toBeNull();
    expect(await sendBrowserConnectInput(String(fx.workspace._id), snap.sessionId, { type: "key", key: "Enter" })).toBe(false);
    expect(sendLoginInput).not.toHaveBeenCalled();
  });

  it("serves frames only to the workspace that started the sign-in", async () => {
    const { ws, snap, pw } = await startRemote();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    captureLoginFrame.mockResolvedValue(jpeg);
    expect(await captureBrowserConnectFrame(ws, snap.sessionId)).toBe(jpeg);
    expect(captureLoginFrame).toHaveBeenCalledWith(pw);

    const other = await createWorkspaceFixture();
    expect(await captureBrowserConnectFrame(String(other.workspace._id), snap.sessionId)).toBeNull();
    expect(await sendBrowserConnectInput(String(other.workspace._id), snap.sessionId, { type: "type", text: "x" })).toBe(false);
    expect(sendLoginInput).not.toHaveBeenCalled();
  });

  it("shares one screenshot between overlapping frame requests and survives a failed one", async () => {
    const { ws, snap } = await startRemote();
    let release: (b: Buffer) => void = () => undefined;
    captureLoginFrame.mockReturnValueOnce(new Promise<Buffer>((resolve) => (release = resolve)));
    const first = captureBrowserConnectFrame(ws, snap.sessionId);
    const second = captureBrowserConnectFrame(ws, snap.sessionId);
    release(Buffer.from("a"));
    expect(await first).toBe(await second);
    expect(captureLoginFrame).toHaveBeenCalledTimes(1);

    captureLoginFrame.mockRejectedValueOnce(new Error("page is navigating"));
    expect(await captureBrowserConnectFrame(ws, snap.sessionId)).toBeNull();
    captureLoginFrame.mockResolvedValueOnce(Buffer.from("b"));
    expect((await captureBrowserConnectFrame(ws, snap.sessionId))?.toString()).toBe("b");
  });

  it("replays input in the order it was sent", async () => {
    const { ws, snap } = await startRemote();
    const order: string[] = [];
    sendLoginInput.mockImplementation(async (_session, input) => {
      // The first action is slow: the second must still wait for it.
      if (input.type === "click") await new Promise((resolve) => setTimeout(resolve, 30));
      order.push(input.type);
    });
    vi.useRealTimers();
    await Promise.all([
      sendBrowserConnectInput(ws, snap.sessionId, { type: "click", x: 10, y: 20 }),
      sendBrowserConnectInput(ws, snap.sessionId, { type: "type", text: "me@x.com" }),
      sendBrowserConnectInput(ws, snap.sessionId, { type: "key", key: "Enter" }),
    ]);
    vi.useFakeTimers();
    expect(order).toEqual(["click", "type", "key"]);
  });

  it("saves the session once even when the page load, the poll and user input all notice the sign-in", async () => {
    const { ws, snap, pw, onSuccess } = await startRemote();
    sendLoginInput.mockResolvedValue(undefined);
    let finishSaving: (id: string) => void = () => undefined;
    onSuccess.mockReturnValue(new Promise<string>((resolve) => (finishSaving = resolve)));
    hasLinkedInSession.mockReturnValue(true);

    // Reading cookies from a real browser takes time, so every checker is mid-flight before any saves.
    let releaseCookies: () => void = () => undefined;
    const cookiesReady = new Promise<void>((resolve) => (releaseCookies = resolve));
    pw.context.cookies.mockImplementation(async () => {
      await cookiesReady;
      return [{ name: "li_at", value: "x" }];
    });

    const onLoad = pw.page.on.mock.calls.find(([event]) => event === "load")?.[1] as () => void;
    onLoad();
    await sendBrowserConnectInput(ws, snap.sessionId, { type: "key", key: "Enter" });
    await vi.advanceTimersByTimeAsync(6000); // several poll ticks
    releaseCookies();
    await vi.advanceTimersByTimeAsync(6000); // and more while the save is still running
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(getBrowserConnectSession(ws, snap.sessionId)).toMatchObject({ status: "pending", saving: true });

    finishSaving("acc-remote");
    await vi.waitFor(() => expect(getBrowserConnectSession(ws, snap.sessionId)?.status).toBe("success"));
    expect(getBrowserConnectSession(ws, snap.sessionId)?.saving).toBeUndefined();
  });

  it("caps how many streamed sign-ins hold a browser at once", async () => {
    vi.stubEnv("BROWSER_CONNECT_MAX", "2");
    try {
      await startRemote();
      await startRemote();
      await expect(startRemote()).rejects.toThrow("BROWSER_CONNECT_BUSY");
      expect(openManualLoginBrowser).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("starting again replaces a sign-in the same user abandoned, but not another user's", async () => {
    const { ws, snap } = await startRemote();
    const fx = { workspaceId: ws, userId: "someone-else", onSuccess: vi.fn() };
    await expect(startBrowserConnectSession(fx)).rejects.toThrow("BROWSER_CONNECT_IN_PROGRESS");

    const owner = (globalThis as { __reachlyBrowserConnectSessions?: Map<string, { userId: string }> })
      .__reachlyBrowserConnectSessions!.get(snap.sessionId)!.userId;
    const again = await startBrowserConnectSession({ workspaceId: ws, userId: owner, mode: "remote", onSuccess: vi.fn() });
    expect(again.sessionId).not.toBe(snap.sessionId);
    expect(getBrowserConnectSession(ws, snap.sessionId)).toBeNull();
    expect(closeManualLoginBrowser).toHaveBeenCalled();
  });

  it("finishes as soon as an action signs the user in, closing the sign-in browser before saving", async () => {
    const { ws, snap, onSuccess } = await startRemote();
    sendLoginInput.mockResolvedValue(undefined);
    const events: string[] = [];
    closeManualLoginBrowser.mockImplementation(async () => void events.push("closed"));
    onSuccess.mockImplementation(async () => {
      events.push("saved");
      return "acc-remote";
    });
    hasLinkedInSession.mockReturnValue(true);

    await sendBrowserConnectInput(ws, snap.sessionId, { type: "key", key: "Enter" });
    await vi.waitFor(() => expect(getBrowserConnectSession(ws, snap.sessionId)?.status).toBe("success"));
    expect(events.slice(0, 2)).toEqual(["closed", "saved"]);
    expect(getBrowserConnectSession(ws, snap.sessionId)?.accountId).toBe("acc-remote");
    expect(await captureBrowserConnectFrame(ws, snap.sessionId)).toBeNull();
  });
});

