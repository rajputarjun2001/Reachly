import { randomUUID } from "crypto";
import type { SessionCookie } from "./linkedinActions";
import * as linkedinActions from "./linkedinActions";
import { normalizeLinkedInCookiesForPlaywright } from "../../utils/linkedinCookies";
import { env } from "../../config/env";

const SESSION_TTL_MS = 15 * 60 * 1000;
const POLL_MS = 2000;

export type BrowserConnectStatus = "pending" | "success" | "failed" | "cancelled";
/** "window": a Chromium window on the server machine. "remote": headless, streamed into the Reachly page. */
export type BrowserConnectMode = "window" | "remote";

export type BrowserConnectSnapshot = {
  sessionId: string;
  status: BrowserConnectStatus;
  mode: BrowserConnectMode;
  /** The user has signed in and the session is being verified and saved (takes a few seconds). */
  saving?: boolean;
  error?: string;
  accountId?: string;
};

type LiveSession = {
  id: string;
  workspaceId: string;
  userId: string;
  status: BrowserConnectStatus;
  mode: BrowserConnectMode;
  /** True while a sign-in check is running, so overlapping checks cannot save the session twice. */
  completing?: boolean;
  /** True once LinkedIn has signed the user in and the session is being verified and saved. */
  saving?: boolean;
  /** In-flight screenshot, shared by overlapping frame requests. */
  frame?: Promise<Buffer>;
  /** Serialises user input so keystrokes and clicks replay in the order they were made. */
  inputQueue: Promise<void>;
  error?: string;
  accountId?: string;
  startedAt: number;
  playwright?: linkedinActions.PlaywrightSession;
  timer?: ReturnType<typeof setInterval>;
  onPageLoad?: () => void;
  onSuccess: (cookies: SessionCookie[]) => Promise<string>;
};

/**
 * Kept on globalThis: Next.js can load this module more than once (server actions and route handlers
 * are bundled separately), and the page that streams frames must find the session the action started.
 * In-memory by nature (a live browser); a multi-instance deployment needs sticky routing.
 */
const globalStore = globalThis as { __reachlyBrowserConnectSessions?: Map<string, LiveSession> };
const sessions = (globalStore.__reachlyBrowserConnectSessions ??= new Map<string, LiveSession>());

function snapshot(s: LiveSession): BrowserConnectSnapshot {
  return {
    sessionId: s.id,
    status: s.status,
    mode: s.mode,
    saving: s.status === "pending" && s.saving ? true : undefined,
    error: s.error,
    accountId: s.accountId,
  };
}

function detachPageListeners(session: LiveSession) {
  if (session.timer) clearInterval(session.timer);
  session.timer = undefined;
  const page = session.playwright?.page;
  if (page && session.onPageLoad) page.off("load", session.onPageLoad);
  session.onPageLoad = undefined;
}

async function finish(session: LiveSession, status: BrowserConnectStatus, extra: Partial<LiveSession> = {}) {
  detachPageListeners(session);
  Object.assign(session, extra, { status });
  await linkedinActions.closeManualLoginBrowser(session.playwright);
  session.playwright = undefined;
}

async function tryComplete(session: LiveSession) {
  // The page-load listener, the poll timer and user input can all get here at once, and saving takes
  // several seconds: without this guard the second caller saves the same account again and fails the
  // sign-in with "already connected".
  if (session.status !== "pending" || !session.playwright || session.completing) return;
  session.completing = true;
  try {
    await completeIfSignedIn(session);
  } finally {
    session.completing = false;
  }
}

async function completeIfSignedIn(session: LiveSession) {
  if (!session.playwright) return;
  const { context, page } = session.playwright;
  const cookies = normalizeLinkedInCookiesForPlaywright(await context.cookies(["https://www.linkedin.com"]));
  const url = page.url();
  if (!linkedinActions.hasLinkedInSession(cookies, url)) return;

  session.saving = true;
  try {
    if (session.mode === "remote") {
      // The cookies are in hand; close the sign-in browser before onSuccess opens another to verify
      // them, so a small server never holds two Chromiums at once.
      detachPageListeners(session);
      await linkedinActions.closeManualLoginBrowser(session.playwright);
      session.playwright = undefined;
    }
    const accountId = await session.onSuccess(cookies);
    session.accountId = accountId;
    await finish(session, "success");
  } catch (err) {
    await finish(session, "failed", { error: (err as Error).message });
  }
}

function assertPendingForWorkspace(workspaceId: string) {
  for (const s of sessions.values()) {
    if (s.workspaceId === String(workspaceId) && s.status === "pending") {
      throw new Error("BROWSER_CONNECT_IN_PROGRESS");
    }
  }
}

export async function startBrowserConnectSession(input: {
  workspaceId: string;
  userId: string;
  mode?: BrowserConnectMode;
  /** Proxy / timezone for the sign-in browser (remote mode signs in from where later sessions will run). */
  browser?: linkedinActions.BrowserOptions;
  onSuccess: (cookies: SessionCookie[]) => Promise<string>;
}): Promise<BrowserConnectSnapshot> {
  // A sign-in the same person abandoned (closed or reloaded the page) would otherwise block the
  // workspace until it times out: starting again replaces it.
  for (const s of [...sessions.values()]) {
    if (s.status === "pending" && s.workspaceId === String(input.workspaceId) && s.userId === String(input.userId) && !s.saving) {
      await finish(s, "cancelled");
      sessions.delete(s.id);
    }
  }
  assertPendingForWorkspace(input.workspaceId);
  const id = randomUUID();
  const mode = input.mode ?? "window";
  if (mode === "remote") {
    // Each streamed sign-in holds a whole Chromium on the server until it finishes or times out.
    const running = [...sessions.values()].filter((s) => s.mode === "remote" && s.status === "pending").length;
    if (running >= env.browserConnectMax) throw new Error("BROWSER_CONNECT_BUSY");
  }
  const session: LiveSession = {
    id,
    workspaceId: String(input.workspaceId),
    userId: String(input.userId),
    status: "pending",
    mode,
    inputQueue: Promise.resolve(),
    startedAt: Date.now(),
    onSuccess: input.onSuccess,
  };
  sessions.set(id, session);

  try {
    session.playwright = await linkedinActions.openManualLoginBrowser({ ...input.browser, remote: mode === "remote" });
  } catch (err) {
    sessions.delete(id);
    throw err;
  }

  session.onPageLoad = () => {
    void tryComplete(session);
  };
  session.playwright.page.on("load", session.onPageLoad);

  await tryComplete(session);

  session.timer = setInterval(() => {
    void (async () => {
      const live = sessions.get(id);
      if (!live || live.status !== "pending") return;
      if (Date.now() - live.startedAt > SESSION_TTL_MS) {
        await finish(live, "failed", { error: "Timed out waiting for LinkedIn sign-in." });
        return;
      }
      try {
        await tryComplete(live);
      } catch (err) {
        await finish(live, "failed", { error: (err as Error).message });
      }
    })();
  }, POLL_MS);

  return snapshot(session);
}

export function getBrowserConnectSession(
  workspaceId: string,
  sessionId: string,
): BrowserConnectSnapshot | null {
  const s = sessions.get(sessionId);
  if (!s || s.workspaceId !== String(workspaceId)) return null;
  return snapshot(s);
}

function liveRemoteSession(workspaceId: string, sessionId: string): LiveSession | null {
  const s = sessions.get(sessionId);
  if (!s || s.workspaceId !== String(workspaceId)) return null;
  if (s.mode !== "remote" || s.status !== "pending" || !s.playwright) return null;
  return s;
}

/** JPEG of the remote sign-in page, or null when there is no live remote session to show. */
export async function captureBrowserConnectFrame(workspaceId: string, sessionId: string): Promise<Buffer | null> {
  const s = liveRemoteSession(workspaceId, sessionId);
  if (!s?.playwright) return null;
  if (!s.frame) {
    const shot = linkedinActions.captureLoginFrame(s.playwright);
    s.frame = shot;
    const clear = () => {
      if (s.frame === shot) s.frame = undefined;
    };
    shot.then(clear, clear);
  }
  try {
    return await s.frame;
  } catch {
    return null; // the page was mid-navigation or the browser just closed; the viewer simply asks again
  }
}

/** Replays one user action in the remote sign-in page. False when there is no live remote session. */
export async function sendBrowserConnectInput(
  workspaceId: string,
  sessionId: string,
  input: linkedinActions.LoginInput,
): Promise<boolean> {
  const s = liveRemoteSession(workspaceId, sessionId);
  if (!s) return false;
  const run = s.inputQueue.then(async () => {
    if (s.status !== "pending" || !s.playwright) return;
    await linkedinActions.sendLoginInput(s.playwright, input);
  });
  s.inputQueue = run.catch(() => undefined);
  await run;
  // The action may have finished the sign-in: check now instead of waiting for the next poll.
  void tryComplete(s).catch(() => undefined);
  return true;
}

export async function cancelBrowserConnectSession(workspaceId: string, sessionId: string): Promise<boolean> {
  const s = sessions.get(sessionId);
  if (!s || s.workspaceId !== String(workspaceId)) return false;
  if (s.status === "pending") await finish(s, "cancelled");
  sessions.delete(sessionId);
  return true;
}

/** @internal test helper */
export function _clearBrowserConnectSessions() {
  for (const s of sessions.values()) {
    if (s.timer) clearInterval(s.timer);
    void linkedinActions.closeManualLoginBrowser(s.playwright);
  }
  sessions.clear();
}
