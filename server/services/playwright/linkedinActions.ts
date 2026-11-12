import fs from "fs";
import { chromium, type Browser, type BrowserContext, type Cookie, type Frame, type Page } from "playwright";
import { normalizeLinkedInCookiesForPlaywright } from "../../utils/linkedinCookies";
import { normalizeLinkedinUrl } from "../../utils/linkedinUrl";

export type SessionCookie = Cookie;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export const VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT = 45000;
const LOGIN_FIELD_TIMEOUT = 30_000;
const LINKEDIN_ORIGIN = "https://www.linkedin.com";
const FEED_URL = `${LINKEDIN_ORIGIN}/feed`;

const LOGIN_USERNAME_SELECTORS = [
  "#username",
  "#session_key",
  'input[name="session_key"]',
  'input[autocomplete="username"]',
  'input[type="email"]',
  'input[aria-label*="Email" i]',
  'input[placeholder*="Email" i]',
];
const LOGIN_PASSWORD_SELECTORS = [
  "#password",
  "#session_password",
  'input[name="session_password"]',
  'input[autocomplete="current-password"]',
  'input[type="password"]',
  'input[aria-label*="Password" i]',
];
const LOGIN_SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'button[aria-label="Sign in"]',
  ".login__form_action_container button",
  'button:has-text("Sign in")',
];
const COOKIE_ACCEPT_SELECTORS = [
  'button[data-control-name*="cookie.consent.accept"]',
  'button[action-type="ACCEPT"]',
  'button:has-text("Accept")',
  'button:has-text("Accept all")',
  'button:has-text("Allow all")',
];

export const ERRORS = {
  CHALLENGE_REQUIRED: "CHALLENGE_REQUIRED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  ACCOUNT_RESTRICTED: "ACCOUNT_RESTRICTED",
  INVITATION_LIMIT: "INVITATION_LIMIT",
  ALREADY_CONNECTED: "ALREADY_CONNECTED",
  ALREADY_PENDING: "ALREADY_PENDING",
  CONNECT_UNAVAILABLE: "CONNECT_UNAVAILABLE",
  MESSAGE_UNAVAILABLE: "MESSAGE_UNAVAILABLE",
} as const;
export type LinkedInError = (typeof ERRORS)[keyof typeof ERRORS];

export const SELECTORS = {
  loginEmail: "#username",
  loginPassword: "#password",
  loginSubmit: 'button[type="submit"]',
  loginError: "#error-for-password, #error-for-username, .form__label--error",
  connectButton: 'main button[aria-label*="connect" i]:not([aria-label*="disconnect" i])',
  moreActions: 'main button[aria-label="More actions"]',
  connectInMenu: 'main div[role="button"][aria-label*="connect" i]',
  pendingButton: 'main button[aria-label*="Pending" i]',
  addNote: 'button[aria-label="Add a note"]',
  noteTextarea: 'textarea[name="message"]',
  sendInvitation: 'button[aria-label="Send invitation"], button[aria-label="Send now"], button[aria-label="Send"]',
  sendWithoutNote: 'button[aria-label="Send without a note"], button[aria-label="Send now"]',
  messageButton: 'main button[aria-label^="Message"]',
  composeBox: 'div.msg-form__contenteditable[contenteditable="true"]',
  composeSend: "button.msg-form__send-button",
  distanceBadge: "main .dist-value",
  inboxItem: "li.msg-conversation-listitem",
};

const RESTRICTION_PATTERNS = [
  /your account (has been|is) (temporarily )?restricted/i,
  /we've restricted your account/i,
  /unusual activity/i,
];
const INVITATION_LIMIT_PATTERNS = [/weekly invitation limit/i, /reached the (weekly )?limit/i];

export type BrowserOptions = { wsEndpoint?: string };
export type ActionResult = { success: boolean; error?: string };
export type ConnectionState = "connected" | "pending" | "not_connected";

export type InboxMessage = { direction: "sent" | "received"; body: string };
export type InboxConversation = {
  threadId: string | null;
  senderName: string;
  preview: string;
  timestamp: string;
  unread: boolean;
  profileUrl?: string | null;
  messages?: InboxMessage[];
};

const humanDelay = (page: Page) => page.waitForTimeout(2000 + Math.random() * 3000);

export const isLoginUrl = (url: string) => /linkedin\.com\/(login|authwall|uas\/login|checkpoint\/lg\/login)/i.test(url);
export const isChallengeUrl = (url: string) =>
  /linkedin\.com\/(checkpoint\/challenge|checkpoint\/(?!lg)|challenge)/i.test(url);

export type PlaywrightSession = { browser: Browser; context: BrowserContext; page: Page };
type Session = PlaywrightSession;

export type LaunchOptions = { headless?: boolean };

function logCookieDebug(label: string, cookies: SessionCookie[]) {
  if (process.env.LINKEDIN_COOKIE_DEBUG !== "true") return;
  console.info(`[linkedin cookies] ${label}`, {
    count: cookies.length,
    hasLiAt: cookies.some((c) => c.name === "li_at"),
    hasJsession: cookies.some((c) => c.name === "JSESSIONID"),
    domains: [...new Set(cookies.map((c) => c.domain))],
  });
}

async function exportSessionCookies(context: BrowserContext): Promise<SessionCookie[]> {
  return normalizeLinkedInCookiesForPlaywright(await context.cookies([LINKEDIN_ORIGIN]));
}

function assertChromiumInstalled() {
  const path = chromium.executablePath();
  if (!fs.existsSync(path)) {
    throw new Error(
      `Executable doesn't exist at ${path} — run npm run browsers:install in the Reachly project, then restart the server.`,
    );
  }
}

function launchChromium(wsEndpoint?: string, launch?: LaunchOptions) {
  if (wsEndpoint) return chromium.connect(wsEndpoint);
  assertChromiumInstalled();
  const headless = launch?.headless ?? process.env.LINKEDIN_HEADLESS !== "false";
  const baseArgs = ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"];
  // Full Chrome headless (not headless-shell): LinkedIn often omits the password form in the shell build.
  if (headless) {
    return chromium.launch({
      headless: false,
      args: [...baseArgs, "--headless=new"],
    });
  }
  return chromium.launch({ headless: false, args: baseArgs });
}

async function openBrowser({ wsEndpoint, cookies }: BrowserOptions & { cookies?: SessionCookie[] }): Promise<Session> {
  const browser = await launchChromium(wsEndpoint);
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    locale: "en-US",
    timezoneId: "UTC",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  if (cookies && cookies.length) {
    const normalized = normalizeLinkedInCookiesForPlaywright(cookies);
    logCookieDebug("restore", normalized);
    await context.addCookies(normalized);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return { browser, context, page };
}

async function withBrowser<T>(
  opts: BrowserOptions & { cookies?: SessionCookie[] },
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const session = await openBrowser(opts);
  try {
    return await fn(session);
  } finally {
    await session.browser.close().catch(() => undefined);
  }
}

async function goto(page: Page, url: string, waitUntil: "domcontentloaded" | "load" = "domcontentloaded") {
  try {
    await page.goto(url, { waitUntil, timeout: NAV_TIMEOUT });
  } catch (err) {
    throw mapNavigationError(err);
  }
}

/** Redirect loops on profile/auth URLs usually mean stale or invalid session cookies. */
function mapNavigationError(err: unknown): Error {
  const message = (err as Error).message || String(err);
  if (/ERR_TOO_MANY_REDIRECTS/i.test(message)) return new Error(ERRORS.SESSION_EXPIRED);
  return err instanceof Error ? err : new Error(message);
}

type LoginRoot = Page | Frame;

async function loginRoots(page: Page): Promise<LoginRoot[]> {
  return [page, ...page.frames().filter((f) => f !== page.mainFrame())];
}

async function hasLoginUsername(root: LoginRoot): Promise<boolean> {
  for (const selector of LOGIN_USERNAME_SELECTORS) {
    if ((await root.locator(selector).count()) > 0) return true;
  }
  return false;
}

/** Waits until username/session_key exists on the page or in a child frame. */
async function waitForLoginForm(page: Page, timeout = 45_000): Promise<LoginRoot> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const root of await loginRoots(page)) {
      if (await hasLoginUsername(root)) return root;
    }
    await page.waitForTimeout(400);
  }
  const title = await page.title().catch(() => "");
  throw new Error(`LOGIN_FORM_NOT_FOUND at ${page.url()} (${title})`);
}

const DOM_FILL_LOGIN = ({ email, password }: { email: string; password: string }) => {
  const pick = (selectors: string[]) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el instanceof HTMLInputElement) return el;
    }
    return null;
  };
  const user = pick(["#username", "#session_key", 'input[name="session_key"]', 'input[autocomplete="username"]', 'input[type="email"]']);
  const pass = pick(["#password", "#session_password", 'input[name="session_password"]', 'input[type="password"]']);
  if (!user || !pass) return false;
  user.focus();
  user.value = email;
  user.dispatchEvent(new Event("input", { bubbles: true }));
  user.dispatchEvent(new Event("change", { bubbles: true }));
  pass.focus();
  pass.value = password;
  pass.dispatchEvent(new Event("input", { bubbles: true }));
  pass.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

async function fillLoginOnRoot(root: LoginRoot, page: Page, email: string, password: string): Promise<string> {
  try {
    const emailSelector = await fillFirstVisibleOnRoot(root, LOGIN_USERNAME_SELECTORS, email);
    await page.waitForTimeout(500 + Math.random() * 1000);
    await fillFirstVisibleOnRoot(root, LOGIN_PASSWORD_SELECTORS, password);
    return emailSelector;
  } catch {
    // fall through
  }

  for (const selector of LOGIN_USERNAME_SELECTORS) {
    const user = root.locator(selector).first();
    try {
      await user.waitFor({ state: "attached", timeout: 5000 });
      await user.fill(email, { force: true, timeout: LOGIN_FIELD_TIMEOUT });
      const pass = root.locator(LOGIN_PASSWORD_SELECTORS.join(", ")).first();
      await pass.fill(password, { force: true, timeout: LOGIN_FIELD_TIMEOUT });
      return `${selector} (force)`;
    } catch {
      // try next selector
    }
  }

  try {
    const byEmail = root.getByLabel(/email or phone|email address|phone number|username/i).first();
    await byEmail.fill(email, { force: true, timeout: LOGIN_FIELD_TIMEOUT });
    await root.getByLabel(/^password$/i).first().fill(password, { force: true, timeout: LOGIN_FIELD_TIMEOUT });
    return "getByLabel (force)";
  } catch {
    // fall through
  }

  const domOk = await root.evaluate(DOM_FILL_LOGIN, { email, password });
  if (!domOk) throw new Error("LOGIN_FORM_NOT_FOUND dom");
  return "dom";
}

async function submitLoginOnRoot(root: LoginRoot) {
  try {
    await clickFirstVisibleOnRoot(root, LOGIN_SUBMIT_SELECTORS);
    return;
  } catch {
    // fall through
  }
  try {
    await root.getByRole("button", { name: /^sign in$/i }).first().click({ force: true, timeout: LOGIN_FIELD_TIMEOUT });
    return;
  } catch {
    // fall through
  }
  const clicked = await root.evaluate(() => {
    const btn =
      document.querySelector('button[type="submit"]') ||
      Array.from(document.querySelectorAll("button")).find((b) => /sign in/i.test(b.textContent || ""));
    if (!(btn instanceof HTMLButtonElement)) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error(`LOGIN_SUBMIT_NOT_FOUND at ${root.url()}`);
}

/** Fills the first matching visible field (LinkedIn duplicates hidden mobile/desktop markup). */
async function fillFirstVisibleOnRoot(root: LoginRoot, selectors: string[], value: string): Promise<string> {
  for (const selector of selectors) {
    const field = root.locator(selector).locator("visible=true").first();
    try {
      await field.waitFor({ state: "visible", timeout: 4000 });
      await field.fill(value, { timeout: LOGIN_FIELD_TIMEOUT });
      return selector;
    } catch {
      // try next selector
    }
  }
  throw new Error("LOGIN_FIELD_NOT_VISIBLE");
}

async function fillFirstVisible(page: Page, selectors: string[], value: string): Promise<string> {
  return fillFirstVisibleOnRoot(page, selectors, value);
}

async function clickFirstVisibleOnRoot(root: LoginRoot, selectors: string[]) {
  for (const selector of selectors) {
    const button = root.locator(selector).locator("visible=true").first();
    try {
      await button.waitFor({ state: "visible", timeout: 4000 });
      await button.click({ timeout: LOGIN_FIELD_TIMEOUT });
      return;
    } catch {
      // try next selector
    }
  }
  throw new Error(`LOGIN_SUBMIT_NOT_FOUND at ${root.url()}`);
}

async function dismissCookieBanner(page: Page) {
  for (const selector of COOKIE_ACCEPT_SELECTORS) {
    const button = page.locator(selector).first();
    try {
      if (await button.isVisible({ timeout: 1500 })) {
        await button.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        return;
      }
    } catch {
      // try next selector
    }
  }
}

export const isLoggedInUrl = (url: string) => /linkedin\.com\/(feed|jobs|mynetwork|m\/)/i.test(url);

export function hasLinkedInSession(cookies: SessionCookie[], pageUrl: string): boolean {
  const hasAuth = cookies.some((c) => c.name === "li_at" && Boolean(c.value));
  if (!hasAuth) return false;
  if (isLoginUrl(pageUrl) || isChallengeUrl(pageUrl)) return false;
  return true;
}

/** Opens a visible Chromium window on the Reachly server for the user to sign in manually. */
export async function openManualLoginBrowser(opts: BrowserOptions = {}): Promise<Session> {
  const browser = await launchChromium(opts.wsEndpoint, { headless: false });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    locale: "en-US",
    timezoneId: "UTC",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(LOGIN_FIELD_TIMEOUT);
  // Feed first: if a session already exists in this browser, LinkedIn lands on the feed instead of the login form.
  await goto(page, "https://www.linkedin.com/feed/", "load");
  await page.waitForTimeout(800);
  if (!hasLinkedInSession(await context.cookies(), page.url()) && isLoginUrl(page.url())) {
    await dismissCookieBanner(page);
  }
  if (!hasLinkedInSession(await context.cookies(), page.url()) && isLoginUrl(page.url())) {
    await goto(page, "https://www.linkedin.com/login", "load");
    await dismissCookieBanner(page);
  }
  return { browser, context, page };
}

export async function closeManualLoginBrowser(session: Session | undefined) {
  if (!session) return;
  await session.browser.close().catch(() => undefined);
}

async function exists(page: Page, selector: string) {
  return (await page.locator(selector).count()) > 0;
}

async function bodyText(page: Page) {
  try {
    return await page.locator("body").innerText({ timeout: 5000 });
  } catch {
    return "";
  }
}

async function warmSessionOnFeed(page: Page): Promise<LinkedInError | null> {
  await goto(page, FEED_URL, "load");
  await humanDelay(page);
  return detectProblem(page);
}

/** Returns an error code if the current page shows a logout, checkpoint or restriction. */
async function detectProblem(page: Page): Promise<LinkedInError | null> {
  const url = page.url();
  if (isLoginUrl(url)) return ERRORS.SESSION_EXPIRED;
  if (isChallengeUrl(url)) return ERRORS.ACCOUNT_RESTRICTED;
  const text = await bodyText(page);
  if (RESTRICTION_PATTERNS.some((re) => re.test(text))) return ERRORS.ACCOUNT_RESTRICTED;
  if (INVITATION_LIMIT_PATTERNS.some((re) => re.test(text))) return ERRORS.INVITATION_LIMIT;
  return null;
}

/** Logs in and returns the session cookies. Throws Error(CHALLENGE_REQUIRED | INVALID_CREDENTIALS). */
export async function loginToLinkedIn(
  email: string,
  password: string,
  opts: BrowserOptions = {},
): Promise<SessionCookie[]> {
  return withBrowser({ wsEndpoint: opts.wsEndpoint }, async ({ context, page }) => {
    const loginUrls = ["https://www.linkedin.com/login", "https://www.linkedin.com/uas/login"];
    let loaded = false;
    for (const loginUrl of loginUrls) {
      try {
        await goto(page, loginUrl, "load");
        loaded = true;
        break;
      } catch {
        // try alternate login URL
      }
    }
    if (!loaded) throw new Error("LOGIN_PAGE_LOAD_FAILED");

    await dismissCookieBanner(page);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await dismissCookieBanner(page);
    await humanDelay(page);

    if (isLoggedInUrl(page.url())) return exportSessionCookies(context);

    page.setDefaultTimeout(LOGIN_FIELD_TIMEOUT);
    const formRoot = await waitForLoginForm(page);
    let emailSelector: string;
    try {
      emailSelector = await fillLoginOnRoot(formRoot, page, email, password);
    } catch (err) {
      const title = await page.title().catch(() => "");
      const hint = (err as Error).message.includes("dom") ? "no inputs in DOM" : "inputs not fillable";
      throw new Error(`LOGIN_FORM_NOT_FOUND at ${page.url()} (${title}; ${hint})`);
    }
    await humanDelay(page);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }).catch(() => undefined),
      submitLoginOnRoot(formRoot),
    ]);
    await humanDelay(page);

    const url = page.url();
    if (isChallengeUrl(url) || /captcha/i.test(url)) throw new Error(ERRORS.CHALLENGE_REQUIRED);
    if (!isLoggedInUrl(url)) {
      if (await exists(page, SELECTORS.loginError)) throw new Error(ERRORS.INVALID_CREDENTIALS);
      if (await exists(page, emailSelector)) throw new Error(ERRORS.INVALID_CREDENTIALS);
      throw new Error(ERRORS.CHALLENGE_REQUIRED);
    }
    return exportSessionCookies(context);
  });
}

export async function verifyCookies(
  cookies: SessionCookie[] | null,
  opts: BrowserOptions = {},
): Promise<{ valid: boolean; error?: string }> {
  if (!cookies || !cookies.length) return { valid: false };
  return withBrowser({ wsEndpoint: opts.wsEndpoint, cookies }, async ({ page }) => {
    logCookieDebug("verify", normalizeLinkedInCookiesForPlaywright(cookies));
    const problem = await warmSessionOnFeed(page);
    if (problem === ERRORS.SESSION_EXPIRED) return { valid: false };
    if (problem === ERRORS.ACCOUNT_RESTRICTED) return { valid: false, error: problem };
    return { valid: true };
  });
}

export async function fetchOwnProfile(
  cookies: SessionCookie[],
  opts: BrowserOptions = {},
): Promise<{ fullName: string; headline: string; profileUrl: string }> {
  return withBrowser({ wsEndpoint: opts.wsEndpoint, cookies }, async ({ page }) => {
    const feedProblem = await warmSessionOnFeed(page);
    if (feedProblem === ERRORS.SESSION_EXPIRED) throw new Error(ERRORS.SESSION_EXPIRED);
    if (feedProblem === ERRORS.ACCOUNT_RESTRICTED) throw new Error(ERRORS.ACCOUNT_RESTRICTED);

    await goto(page, "https://www.linkedin.com/in/me/");
    await humanDelay(page);
    const fullName = (await page.locator("main h1").first().innerText().catch(() => "")).trim();
    const headline = (await page.locator("main .text-body-medium").first().innerText().catch(() => "")).trim();
    return { fullName, headline, profileUrl: page.url().split("?")[0] };
  });
}

export async function sendConnectionRequest(
  cookies: SessionCookie[],
  profileUrl: string,
  note: string,
  opts: BrowserOptions = {},
): Promise<ActionResult> {
  try {
    return await withBrowser({ wsEndpoint: opts.wsEndpoint, cookies }, async ({ page }) => {
      const feedProblem = await warmSessionOnFeed(page);
      if (feedProblem) return { success: false, error: feedProblem };

      const target = normalizeLinkedinUrl(profileUrl) ?? profileUrl;
      await goto(page, target);
      await humanDelay(page);
      const problem = await detectProblem(page);
      if (problem) return { success: false, error: problem };

      if (await exists(page, SELECTORS.pendingButton)) return { success: false, error: ERRORS.ALREADY_PENDING };

      let connect = page.locator(SELECTORS.connectButton).first();
      if (!(await connect.count()) && (await exists(page, SELECTORS.moreActions))) {
        await page.locator(SELECTORS.moreActions).first().click();
        await page.waitForTimeout(800 + Math.random() * 700);
        connect = page.locator(SELECTORS.connectInMenu).first();
      }
      if (!(await connect.count())) {
        const degree = await page
          .locator(SELECTORS.distanceBadge)
          .first()
          .innerText()
          .catch(() => "");
        return {
          success: false,
          error: /1st/.test(degree) ? ERRORS.ALREADY_CONNECTED : ERRORS.CONNECT_UNAVAILABLE,
        };
      }

      await connect.click();
      await humanDelay(page);

      if (note) {
        await page.locator(SELECTORS.addNote).first().click();
        await page.waitForTimeout(800 + Math.random() * 700);
        await page.locator(SELECTORS.noteTextarea).first().fill(note);
        await humanDelay(page);
        await page.locator(SELECTORS.sendInvitation).first().click();
      } else {
        await page.locator(SELECTORS.sendWithoutNote).first().click();
      }
      await humanDelay(page);

      const after = await detectProblem(page);
      if (after) return { success: false, error: after };
      return { success: true };
    });
  } catch (err) {
    return { success: false, error: mapNavigationError(err).message };
  }
}

export async function sendMessage(
  cookies: SessionCookie[],
  profileUrl: string,
  messageBody: string,
  opts: BrowserOptions = {},
): Promise<ActionResult> {
  try {
    return await withBrowser({ wsEndpoint: opts.wsEndpoint, cookies }, async ({ page }) => {
      const feedProblem = await warmSessionOnFeed(page);
      if (feedProblem) return { success: false, error: feedProblem };

      const target = normalizeLinkedinUrl(profileUrl) ?? profileUrl;
      await goto(page, target);
      await humanDelay(page);
      const problem = await detectProblem(page);
      if (problem) return { success: false, error: problem };

      const button = page.locator(SELECTORS.messageButton).first();
      if (!(await button.count())) return { success: false, error: ERRORS.MESSAGE_UNAVAILABLE };
      await button.click();
      await humanDelay(page);

      const compose = page.locator(SELECTORS.composeBox).last();
      await compose.waitFor({ state: "visible" });
      await compose.fill(messageBody);
      await humanDelay(page);
      await page.locator(SELECTORS.composeSend).last().click();
      await humanDelay(page);

      const after = await detectProblem(page);
      if (after) return { success: false, error: after };
      return { success: true };
    });
  } catch (err) {
    return { success: false, error: mapNavigationError(err).message };
  }
}

export async function checkConnectionStatus(
  cookies: SessionCookie[],
  profileUrls: string[],
  opts: BrowserOptions = {},
): Promise<ActionResult & { results: Record<string, ConnectionState> }> {
  const results: Record<string, ConnectionState> = {};
  try {
    return await withBrowser({ wsEndpoint: opts.wsEndpoint, cookies }, async ({ page }) => {
      const feedProblem = await warmSessionOnFeed(page);
      if (feedProblem === ERRORS.SESSION_EXPIRED || feedProblem === ERRORS.ACCOUNT_RESTRICTED) {
        return { success: false, error: feedProblem, results };
      }

      for (const url of profileUrls) {
        await goto(page, url);
        await humanDelay(page);
        const problem = await detectProblem(page);
        if (problem === ERRORS.SESSION_EXPIRED || problem === ERRORS.ACCOUNT_RESTRICTED) {
          return { success: false, error: problem, results };
        }
        const degree = await page
          .locator(SELECTORS.distanceBadge)
          .first()
          .innerText()
          .catch(() => "");
        if (/1st/.test(degree)) results[url] = "connected";
        else if (await exists(page, SELECTORS.pendingButton)) results[url] = "pending";
        else results[url] = "not_connected";
      }
      return { success: true, results };
    });
  } catch (err) {
    return { success: false, error: mapNavigationError(err).message, results };
  }
}

/* Executed inside the browser. */
function extractInboxList(items: Element[]): InboxConversation[] {
  return items.slice(0, 30).map((li) => {
    const link = li.querySelector('a[href*="/messaging/thread/"]');
    const href = link ? link.getAttribute("href") || "" : "";
    const match = href.match(/\/messaging\/thread\/([^/?]+)/);
    const text = (sel: string) => (li.querySelector(sel)?.textContent || "").trim();
    return {
      threadId: match ? decodeURIComponent(match[1]) : null,
      senderName: text(".msg-conversation-listitem__participant-names"),
      preview: text(".msg-conversation-card__message-snippet"),
      timestamp: text("time"),
      unread: !!li.querySelector(".msg-conversation-card__convo-item--unread, .notification-badge--show"),
    };
  });
}

/* Executed inside the browser. */
function extractThread(): { profileUrl: string | null; messages: InboxMessage[] } {
  const profile = document.querySelector<HTMLAnchorElement>(
    '.msg-thread a[href*="/in/"], .msg-overlay-bubble-header a[href*="/in/"], a.msg-thread__link-to-profile',
  );
  const events = Array.from(document.querySelectorAll("li.msg-s-message-list__event")).slice(-20);
  let lastDirection: "sent" | "received" | null = null;
  const messages = events
    .map((ev) => {
      const item = ev.querySelector(".msg-s-event-listitem");
      if (item) lastDirection = item.classList.contains("msg-s-event-listitem--other") ? "received" : "sent";
      const body = (ev.querySelector(".msg-s-event-listitem__body")?.textContent || "").trim();
      return { direction: lastDirection || "received", body } as InboxMessage;
    })
    .filter((m) => m.body);
  return { profileUrl: profile ? profile.href.split("?")[0] : null, messages };
}

export async function scrapeInbox(
  cookies: SessionCookie[],
  opts: BrowserOptions & { maxThreads?: number } = {},
): Promise<ActionResult & { conversations?: InboxConversation[] }> {
  const maxThreads = opts.maxThreads ?? 10;
  try {
    return await withBrowser({ wsEndpoint: opts.wsEndpoint, cookies }, async ({ page }) => {
      await goto(page, "https://www.linkedin.com/messaging/");
      await humanDelay(page);
      const problem = await detectProblem(page);
      if (problem === ERRORS.SESSION_EXPIRED || problem === ERRORS.ACCOUNT_RESTRICTED) {
        return { success: false, error: problem };
      }
      const hasItems = await page
        .locator(SELECTORS.inboxItem)
        .first()
        .waitFor({ timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      if (!hasItems) return { success: true, conversations: [] };

      const list = (await page.$$eval(SELECTORS.inboxItem, extractInboxList)).filter((c) => c.threadId);

      // Open unread threads (and threads whose preview isn't ours) to collect sender profile + messages.
      const toOpen = list.filter((c) => c.unread || !/^you:/i.test(c.preview)).slice(0, maxThreads);
      for (const conv of toOpen) {
        await goto(page, `https://www.linkedin.com/messaging/thread/${encodeURIComponent(conv.threadId!)}/`);
        await humanDelay(page);
        const detail = await page.evaluate(extractThread).catch(() => null);
        if (detail) Object.assign(conv, detail);
      }
      return { success: true, conversations: list };
    });
  } catch (err) {
    return { success: false, error: mapNavigationError(err).message };
  }
}
