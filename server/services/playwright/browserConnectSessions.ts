import { randomUUID } from "crypto";
import type { SessionCookie } from "./linkedinActions";
import * as linkedinActions from "./linkedinActions";

const SESSION_TTL_MS = 15 * 60 * 1000;
const POLL_MS = 2000;

export type BrowserConnectStatus = "pending" | "success" | "failed" | "cancelled";

export type BrowserConnectSnapshot = {
  sessionId: string;
  status: BrowserConnectStatus;
  error?: string;
  accountId?: string;
};

type LiveSession = {
  id: string;
  workspaceId: string;
  userId: string;
  status: BrowserConnectStatus;
  error?: string;
  accountId?: string;
  startedAt: number;
  playwright?: linkedinActions.PlaywrightSession;
  timer?: ReturnType<typeof setInterval>;
  onPageLoad?: () => void;
  onSuccess: (cookies: SessionCookie[]) => Promise<string>;
};

const sessions = new Map<string, LiveSession>();

function snapshot(s: LiveSession): BrowserConnectSnapshot {
  return { sessionId: s.id, status: s.status, error: s.error, accountId: s.accountId };
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
  if (session.status !== "pending" || !session.playwright) return;
  const { context, page } = session.playwright;
  const cookies = await context.cookies();
  const url = page.url();
  if (!linkedinActions.hasLinkedInSession(cookies, url)) return;

  try {
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
  onSuccess: (cookies: SessionCookie[]) => Promise<string>;
}): Promise<BrowserConnectSnapshot> {
  assertPendingForWorkspace(input.workspaceId);
  const id = randomUUID();
  const session: LiveSession = {
    id,
    workspaceId: String(input.workspaceId),
    userId: String(input.userId),
    status: "pending",
    startedAt: Date.now(),
    onSuccess: input.onSuccess,
  };
  sessions.set(id, session);

  try {
    session.playwright = await linkedinActions.openManualLoginBrowser();
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
