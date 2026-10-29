import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { createWorkspaceFixture } from "./factory";
import * as li from "../services/playwright/linkedinActions";
import {
  _clearBrowserConnectSessions,
  cancelBrowserConnectSession,
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
  };
});

useTestDb();

const openManualLoginBrowser = vi.mocked(li.openManualLoginBrowser);
const closeManualLoginBrowser = vi.mocked(li.closeManualLoginBrowser);
const hasLinkedInSession = vi.mocked(li.hasLinkedInSession);

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
