import { beforeEach, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright";
import * as li from "../services/playwright/linkedinActions";
import type { InboxConversation, SessionCookie } from "../services/playwright/linkedinActions";

vi.mock("playwright", () => ({ chromium: { launch: vi.fn(), connect: vi.fn() } }));

const { SELECTORS: S } = li;
const COOKIE = [{ name: "a" }] as unknown as SessionCookie[];

type Elements = Record<string, { text?: string }>;
type FakePage = { url?: string; elements?: Elements; body?: string };
type FakeOptions = {
  pages?: Record<string, FakePage>;
  afterLoginUrl?: string;
  onClick?: Record<string, { elements?: Elements; body?: string }>;
};
type Action = [string, string, string?];

/**
 * Minimal fake of the Playwright surface linkedinActions uses.
 * `pages` maps URL -> { url?: finalUrl, elements: { selector: { text? } }, body? };
 * `onClick` maps selector -> elements revealed (and optional new body text) after clicking it.
 */
function fakeBrowser({ pages = {}, afterLoginUrl, onClick = {} }: FakeOptions = {}) {
  const state: { url: string; elements: Elements; body: string } = { url: "about:blank", elements: {}, body: "" };
  const actions: Action[] = [];
  const load = (url: string) => {
    const p = pages[url] || pages["*"] || {};
    state.url = p.url || url;
    state.elements = { ...(p.elements || {}) };
    state.body = p.body || "";
  };
  const locator = (sel: string) => {
    const loc = {
      first: () => loc,
      last: () => loc,
      count: async () => (state.elements[sel] ? 1 : 0),
      click: async () => {
        if (!state.elements[sel]) throw new Error(`No element ${sel}`);
        actions.push(["click", sel]);
        const effect = onClick[sel];
        if (effect) {
          Object.assign(state.elements, effect.elements || {});
          if (effect.body !== undefined) state.body = effect.body;
        }
      },
      fill: async (v: string) => {
        actions.push(["fill", sel, v]);
      },
      innerText: async () => {
        if (sel === "body") return state.body;
        if (!state.elements[sel]) throw new Error("missing");
        return state.elements[sel].text || "";
      },
      waitFor: async () => {
        if (!state.elements[sel]) throw new Error("timeout");
      },
    };
    return loc;
  };
  const page = {
    goto: vi.fn(async (url: string) => load(url)),
    url: () => state.url,
    waitForTimeout: vi.fn(async (_ms: number) => undefined),
    setDefaultTimeout: vi.fn(),
    fill: vi.fn(async (sel: string, v: string) => {
      actions.push(["fill", sel, v]);
    }),
    click: vi.fn(async (sel: string) => {
      actions.push(["click", sel]);
      if (sel === S.loginSubmit && afterLoginUrl) load(afterLoginUrl);
    }),
    waitForNavigation: vi.fn(async () => undefined),
    locator,
    $$eval: vi.fn(async (): Promise<InboxConversation[]> => []),
    evaluate: vi.fn(async (): Promise<unknown> => null),
  };
  const context = {
    addCookies: vi.fn(async () => undefined),
    cookies: vi.fn(async () => [{ name: "li_at", value: "v" }]),
    newPage: vi.fn(async () => page),
  };
  const browser = { newContext: vi.fn(async () => context), close: vi.fn(async () => undefined) };
  vi.mocked(chromium.launch).mockResolvedValue(browser as unknown as Browser);
  vi.mocked(chromium.connect).mockResolvedValue(browser as unknown as Browser);
  return { browser, context, page, actions };
}

// Shorthand for "clicking `sel` reveals these selectors".
const reveals = (...selectors: string[]): { elements: Elements } => ({
  elements: Object.fromEntries(selectors.map((s) => [s, {}])),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("browser setup", () => {
  it("launches headless chromium with the spec user agent and viewport and human delays", async () => {
    const { browser, context, page } = fakeBrowser({ pages: { "*": {} } });
    await li.verifyCookies(COOKIE);
    expect(chromium.launch).toHaveBeenCalledWith({ headless: true });
    expect(browser.newContext).toHaveBeenCalledWith({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      viewport: { width: 1280, height: 800 },
    });
    expect(context.addCookies).toHaveBeenCalledWith(COOKIE);
    const delay = page.waitForTimeout.mock.calls[0][0];
    expect(delay).toBeGreaterThanOrEqual(2000);
    expect(delay).toBeLessThan(5000);
    expect(browser.close).toHaveBeenCalled();
  });

  it("connects to a container browser server when a wsEndpoint is given", async () => {
    fakeBrowser({ pages: { "*": {} } });
    await li.verifyCookies(COOKIE, { wsEndpoint: "ws://127.0.0.1:5000/" });
    expect(chromium.connect).toHaveBeenCalledWith("ws://127.0.0.1:5000/");
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it("classifies login and challenge URLs", () => {
    expect(li.isLoginUrl("https://www.linkedin.com/authwall?trk=x")).toBe(true);
    expect(li.isLoginUrl("https://www.linkedin.com/feed/")).toBe(false);
    expect(li.isChallengeUrl("https://www.linkedin.com/checkpoint/challenge/abc")).toBe(true);
    expect(li.isChallengeUrl("https://www.linkedin.com/checkpoint/lg/login")).toBe(false);
  });
});

describe("loginToLinkedIn", () => {
  it("returns cookies when landing on /feed", async () => {
    const { actions, browser } = fakeBrowser({ afterLoginUrl: "https://www.linkedin.com/feed/" });
    const cookies = await li.loginToLinkedIn("me@x.com", "pw");
    expect(cookies).toEqual([{ name: "li_at", value: "v" }]);
    expect(actions).toEqual(
      expect.arrayContaining([
        ["fill", S.loginEmail, "me@x.com"],
        ["fill", S.loginPassword, "pw"],
        ["click", S.loginSubmit],
      ]),
    );
    expect(browser.close).toHaveBeenCalled();
  });

  it("throws CHALLENGE_REQUIRED on checkpoint pages", async () => {
    const { browser } = fakeBrowser({ afterLoginUrl: "https://www.linkedin.com/checkpoint/challenge/abc" });
    await expect(li.loginToLinkedIn("me@x.com", "pw")).rejects.toThrow("CHALLENGE_REQUIRED");
    expect(browser.close).toHaveBeenCalled();
  });

  it("throws INVALID_CREDENTIALS when the login form shows an error", async () => {
    fakeBrowser({
      pages: {
        "https://www.linkedin.com/login-error": { url: "https://www.linkedin.com/login", elements: { [S.loginError]: {} } },
      },
      afterLoginUrl: "https://www.linkedin.com/login-error",
    });
    await expect(li.loginToLinkedIn("me@x.com", "bad")).rejects.toThrow("INVALID_CREDENTIALS");
  });
});

describe("verifyCookies", () => {
  it("invalid when redirected to login, valid on feed", async () => {
    fakeBrowser({ pages: { "https://www.linkedin.com/feed": { url: "https://www.linkedin.com/login?session_redirect=x" } } });
    expect(await li.verifyCookies(COOKIE)).toEqual({ valid: false });
    fakeBrowser({ pages: { "https://www.linkedin.com/feed": {} } });
    expect(await li.verifyCookies(COOKIE)).toEqual({ valid: true });
    expect(await li.verifyCookies([])).toEqual({ valid: false });
    expect(await li.verifyCookies(null)).toEqual({ valid: false });
  });

  it("reports restricted accounts", async () => {
    fakeBrowser({ pages: { "https://www.linkedin.com/feed": { body: "We've restricted your account" } } });
    expect(await li.verifyCookies(COOKIE)).toEqual({ valid: false, error: "ACCOUNT_RESTRICTED" });
  });
});

describe("sendConnectionRequest", () => {
  const profile = "https://www.linkedin.com/in/jane";

  it("clicks Connect, adds the note and sends", async () => {
    const { actions } = fakeBrowser({
      pages: { [profile]: { elements: { [S.connectButton]: {} } } },
      onClick: { [S.connectButton]: reveals(S.addNote), [S.addNote]: reveals(S.noteTextarea, S.sendInvitation) },
    });
    expect(await li.sendConnectionRequest(COOKIE, profile, "Hi Jane")).toEqual({ success: true });
    expect(actions).toEqual([
      ["click", S.connectButton],
      ["click", S.addNote],
      ["fill", S.noteTextarea, "Hi Jane"],
      ["click", S.sendInvitation],
    ]);
  });

  it("sends without a note via the More menu when Connect is hidden", async () => {
    const { actions } = fakeBrowser({
      pages: { [profile]: { elements: { [S.moreActions]: {} } } },
      onClick: { [S.moreActions]: reveals(S.connectInMenu), [S.connectInMenu]: reveals(S.sendWithoutNote) },
    });
    expect(await li.sendConnectionRequest(COOKIE, profile, "")).toEqual({ success: true });
    expect(actions.map((a) => a[1])).toEqual([S.moreActions, S.connectInMenu, S.sendWithoutNote]);
  });

  it.each<[string, FakePage, string]>([
    ["pending invitation", { elements: { [S.pendingButton]: {} } }, "ALREADY_PENDING"],
    ["1st-degree connection", { elements: { [S.distanceBadge]: { text: "· 1st" } } }, "ALREADY_CONNECTED"],
    ["no connect option", { elements: {} }, "CONNECT_UNAVAILABLE"],
    ["logged out", { url: "https://www.linkedin.com/authwall?x" }, "SESSION_EXPIRED"],
    ["restricted", { body: "Your account has been temporarily restricted" }, "ACCOUNT_RESTRICTED"],
  ])("returns an error code for %s", async (_, page, code) => {
    fakeBrowser({ pages: { [profile]: page } });
    expect(await li.sendConnectionRequest(COOKIE, profile, "n")).toEqual({ success: false, error: code });
  });

  it("detects the weekly invitation limit after sending", async () => {
    fakeBrowser({
      pages: { [profile]: { elements: { [S.connectButton]: {} } } },
      onClick: {
        [S.connectButton]: reveals(S.sendWithoutNote),
        [S.sendWithoutNote]: { body: "You've reached the weekly invitation limit" },
      },
    });
    expect(await li.sendConnectionRequest(COOKIE, profile, "")).toEqual({ success: false, error: "INVITATION_LIMIT" });
  });

  it("always closes the browser and returns success:false on unexpected errors", async () => {
    const { browser, page } = fakeBrowser({ pages: { [profile]: {} } });
    page.goto.mockRejectedValueOnce(new Error("net::ERR_TIMED_OUT"));
    expect(await li.sendConnectionRequest(COOKIE, profile, "")).toEqual({ success: false, error: "net::ERR_TIMED_OUT" });
    expect(browser.close).toHaveBeenCalled();
  });
});

describe("sendMessage", () => {
  const profile = "https://www.linkedin.com/in/jane";

  it("opens the composer, fills and sends", async () => {
    const { actions } = fakeBrowser({
      pages: { [profile]: { elements: { [S.messageButton]: {} } } },
      onClick: { [S.messageButton]: reveals(S.composeBox, S.composeSend) },
    });
    expect(await li.sendMessage(COOKIE, profile, "Hello")).toEqual({ success: true });
    expect(actions).toEqual([
      ["click", S.messageButton],
      ["fill", S.composeBox, "Hello"],
      ["click", S.composeSend],
    ]);
  });

  it("reports MESSAGE_UNAVAILABLE when there is no Message button", async () => {
    fakeBrowser({ pages: { [profile]: {} } });
    expect(await li.sendMessage(COOKIE, profile, "Hello")).toEqual({ success: false, error: "MESSAGE_UNAVAILABLE" });
  });
});

describe("fetchOwnProfile", () => {
  it("reads the name and headline from /in/me and strips the query string", async () => {
    fakeBrowser({
      pages: {
        "https://www.linkedin.com/in/me/": {
          url: "https://www.linkedin.com/in/jane-doe/?trk=x",
          elements: { "main h1": { text: " Jane Doe " }, "main .text-body-medium": { text: "Founder" } },
        },
      },
    });
    expect(await li.fetchOwnProfile(COOKIE)).toEqual({
      fullName: "Jane Doe",
      headline: "Founder",
      profileUrl: "https://www.linkedin.com/in/jane-doe/",
    });
  });
});

describe("checkConnectionStatus and scrapeInbox", () => {
  it("classifies profiles as connected / pending / not_connected", async () => {
    fakeBrowser({
      pages: {
        "https://www.linkedin.com/in/a": { elements: { [S.distanceBadge]: { text: "1st" } } },
        "https://www.linkedin.com/in/b": { elements: { [S.pendingButton]: {} } },
        "https://www.linkedin.com/in/c": {},
      },
    });
    const res = await li.checkConnectionStatus(COOKIE, [
      "https://www.linkedin.com/in/a",
      "https://www.linkedin.com/in/b",
      "https://www.linkedin.com/in/c",
    ]);
    expect(res).toEqual({
      success: true,
      results: {
        "https://www.linkedin.com/in/a": "connected",
        "https://www.linkedin.com/in/b": "pending",
        "https://www.linkedin.com/in/c": "not_connected",
      },
    });
  });

  it("stops checking when the session expires mid-batch", async () => {
    fakeBrowser({
      pages: {
        "https://www.linkedin.com/in/a": { elements: { [S.distanceBadge]: { text: "1st" } } },
        "https://www.linkedin.com/in/b": { url: "https://www.linkedin.com/login" },
      },
    });
    const res = await li.checkConnectionStatus(COOKIE, ["https://www.linkedin.com/in/a", "https://www.linkedin.com/in/b"]);
    expect(res).toEqual({ success: false, error: "SESSION_EXPIRED", results: { "https://www.linkedin.com/in/a": "connected" } });
  });

  it("scrapeInbox returns conversations and opens unread threads for details", async () => {
    const { page } = fakeBrowser({
      pages: { "https://www.linkedin.com/messaging/": { elements: { [S.inboxItem]: {} } }, "*": {} },
    });
    page.$$eval.mockResolvedValueOnce([
      { threadId: "t1", senderName: "Jane", preview: "Hi!", timestamp: "10:00", unread: true },
      { threadId: "t2", senderName: "Bob", preview: "You: ok", timestamp: "09:00", unread: false },
      { threadId: null, senderName: "x", preview: "", timestamp: "", unread: false },
    ]);
    page.evaluate.mockResolvedValueOnce({
      profileUrl: "https://www.linkedin.com/in/jane",
      messages: [{ direction: "received", body: "Hi!" }],
    });
    const res = await li.scrapeInbox(COOKIE);
    expect(res.success).toBe(true);
    expect(res.conversations).toHaveLength(2);
    expect(res.conversations?.[0]).toMatchObject({ threadId: "t1", profileUrl: "https://www.linkedin.com/in/jane" });
    expect(res.conversations?.[1].profileUrl).toBeUndefined();
    expect(page.goto).toHaveBeenCalledWith("https://www.linkedin.com/messaging/thread/t1/", expect.any(Object));
    expect(page.goto).not.toHaveBeenCalledWith("https://www.linkedin.com/messaging/thread/t2/", expect.any(Object));
  });

  it("scrapeInbox reports SESSION_EXPIRED and handles an empty inbox", async () => {
    fakeBrowser({ pages: { "https://www.linkedin.com/messaging/": { url: "https://www.linkedin.com/login" } } });
    expect(await li.scrapeInbox(COOKIE)).toEqual({ success: false, error: "SESSION_EXPIRED" });
    fakeBrowser({ pages: { "https://www.linkedin.com/messaging/": {} } });
    expect(await li.scrapeInbox(COOKIE)).toEqual({ success: true, conversations: [] });
  });
});
