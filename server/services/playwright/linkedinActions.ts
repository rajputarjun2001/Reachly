import fs from "fs";
import { chromium, type Browser, type BrowserContext, type Cookie, type Frame, type Page } from "playwright";
import { normalizeLinkedInCookiesForPlaywright } from "../../utils/linkedinCookies";
import { normalizeLinkedinUrl } from "../../utils/linkedinUrl";
import type { ProxySettings } from "../../utils/proxy";

export type SessionCookie = Cookie;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export const VIEWPORT = { width: 1280, height: 800 };
/** Smaller page for the streamed sign-in, so its text stays readable when scaled into a dialog. */
export const REMOTE_LOGIN_VIEWPORT = { width: 1024, height: 720 };
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
/**
 * Sign-in verification ("checkpoint") page. Best-effort selectors: LinkedIn's known ids first, then
 * generic fallbacks. Not yet verified against a live account.
 */
const CODE_INPUT_SELECTORS = [
  "#input__email_verification_pin",
  "#input__phone_verification_pin",
  'input[name="pin"]',
  'input[autocomplete="one-time-code"]',
  'input[name*="verification" i]',
  'input[id*="verification" i]',
  'input[name*="otp" i]',
];
const CODE_SUBMIT_SELECTORS = [
  "#email-pin-submit-button",
  "#two-step-submit-button",
  'button[type="submit"]',
  'button:has-text("Submit")',
  'button:has-text("Verify")',
];
const CAPTCHA_SELECTORS = [
  "#captcha-internal",
  'iframe[src*="captcha" i]',
  'iframe[src*="arkoselabs" i]',
  'iframe[title*="captcha" i]',
  'iframe[title*="security verification" i]',
  "[data-sitekey]",
];
const CAPTCHA_TEXT_RE = /security (check|verification)|verify (that )?you.?re (a )?human|not a robot|solve (this|the) puzzle/i;
const APP_APPROVAL_RE = /linkedin app|check your (phone|device|notifications)|approve (this |the )?sign.?in|tap yes/i;

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
  PROXY_FAILED: "PROXY_FAILED",
  /** LinkedIn showed a CAPTCHA. Never solved here: the user must sign in themselves. */
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  /** LinkedIn rejected the verification code; the same sign-in can be retried with another code. */
  INVALID_CODE: "INVALID_CODE",
} as const;
export type LinkedInError = (typeof ERRORS)[keyof typeof ERRORS];

export const SELECTORS = {
  loginEmail: "#username",
  loginPassword: "#password",
  loginSubmit: 'button[type="submit"]',
  loginError: "#error-for-password, #error-for-username, .form__label--error",
  // Scoped to the profile's own top card (the section holding its <h1>). A page-wide match can hit a
  // Connect or Pending button that belongs to someone else, e.g. in "People you may know".
  connectButton: 'section:has(h1) button[aria-label*="connect" i]:not([aria-label*="disconnect" i])',
  moreActions: 'section:has(h1) button[aria-label="More actions"]',
  connectInMenu: 'section:has(h1) div[role="button"][aria-label*="connect" i]',
  pendingButton: 'section:has(h1) button[aria-label*="Pending" i]',
  addNote: 'button[aria-label="Add a note"]',
  noteTextarea: 'textarea[name="message"]',
  sendInvitation: 'button[aria-label="Send invitation"], button[aria-label="Send now"], button[aria-label="Send"]',
  sendWithoutNote: 'button[aria-label="Send without a note"], button[aria-label="Send now"]',
  messageButton: 'main button[aria-label^="Message"]',
  composeBox: 'div.msg-form__contenteditable[contenteditable="true"]',
  composeSend: "button.msg-form__send-button",
  distanceBadge: "section:has(h1) .dist-value",
  inboxItem: "li.msg-conversation-listitem",
};

const RESTRICTION_PATTERNS = [
  /your account (has been|is) (temporarily )?restricted/i,
  /we've restricted your account/i,
  /unusual activity/i,
];
const INVITATION_LIMIT_PATTERNS = [/weekly invitation limit/i, /reached the (weekly )?limit/i];

export type BrowserOptions = {
  wsEndpoint?: string;
  /** Route this account's traffic through its own proxy so LinkedIn sees a consistent, local IP. */
  proxy?: ProxySettings;
  /** IANA timezone the browser reports; defaults to UTC. */
  timezoneId?: string;
};
export type ActionResult = {
  success: boolean;
  error?: string;
  /** What the page showed when an action could not be done (for the lead's status and for debugging). */
  detail?: string;
};
export type ConnectionState = "connected" | "pending" | "not_connected";

/** Where LinkedIn says it sent the sign-in code. */
export type CodeChannel = "email" | "sms" | "authenticator" | "unknown";
/** A sign-in LinkedIn will only finish after the account owner proves it is them. */
export type LoginVerification = {
  /** "code": the owner types a code. "app": the owner approves the sign-in in the LinkedIn mobile app. */
  kind: "code" | "app";
  channel: CodeChannel;
  /** LinkedIn's own heading on the verification page, shown to the user as-is. */
  hint: string;
};
export type LoginStart =
  | { status: "success"; cookies: SessionCookie[] }
  | ({ status: "verification"; session: PlaywrightSession } & LoginVerification);
export type LoginContinue = { status: "success"; cookies: SessionCookie[] } | ({ status: "verification" } & LoginVerification);

/** `message` is one of ERRORS (so existing `message === ERRORS.X` checks keep working); `detail` is for logs. */
export class LinkedInLoginError extends Error {
  constructor(
    code: string,
    public detail?: string,
  ) {
    super(code);
    this.name = "LinkedInLoginError";
  }
}

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

/** The advertised Chrome version must match the real engine, or the UA contradicts its own client hints. */
function userAgentFor(browser: Browser): string {
  try {
    const major = Number(browser.version().split(".")[0]);
    if (major > 0) return USER_AGENT.replace(/Chrome\/\d+/, `Chrome/${major}`);
  } catch {
    // fall through to the static user agent
  }
  return USER_AGENT;
}

async function openBrowser({
  wsEndpoint,
  proxy,
  timezoneId,
  cookies,
  viewport = VIEWPORT,
}: BrowserOptions & { cookies?: SessionCookie[]; viewport?: { width: number; height: number } }): Promise<Session> {
  const browser = await launchChromium(wsEndpoint);
  const context = await browser.newContext({
    userAgent: userAgentFor(browser),
    viewport,
    locale: "en-US",
    timezoneId: timezoneId || "UTC",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    ...(proxy ? { proxy } : {}),
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

const PROXY_ERROR_RE =
  /ERR_(PROXY_|TUNNEL_CONNECTION_FAILED|NO_SUPPORTED_PROXIES|SOCKS_CONNECTION|INVALID_AUTH_CREDENTIALS|MANDATORY_PROXY)/i;

/** Redirect loops on profile/auth URLs usually mean stale or invalid session cookies. */
function mapNavigationError(err: unknown): Error {
  const message = (err as Error).message || String(err);
  if (/ERR_TOO_MANY_REDIRECTS/i.test(message)) return new Error(ERRORS.SESSION_EXPIRED);
  if (PROXY_ERROR_RE.test(message)) return new Error(ERRORS.PROXY_FAILED);
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

const isLinkedInHost = (url: string) => {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "http:" && protocol !== "https:") return true; // about:blank, chrome-error:, data:
    return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
  } catch {
    return true;
  }
};

/**
 * Opens a browser on the Reachly server for the user to sign in to LinkedIn themselves.
 * - default: a visible Chromium window (only useful when the server is the user's own computer).
 * - `remote`: headless, driven through captureLoginFrame() / sendLoginInput() so the page can be shown
 *   inside Reachly on a deployed server. It uses the account's proxy and timezone, so LinkedIn sees the
 *   sign-in from the same place later sessions will come from.
 */
export async function openManualLoginBrowser(opts: BrowserOptions & { remote?: boolean } = {}): Promise<Session> {
  let session: Session;
  if (opts.remote) {
    session = await openBrowser({
      wsEndpoint: opts.wsEndpoint,
      proxy: opts.proxy,
      timezoneId: opts.timezoneId,
      viewport: REMOTE_LOGIN_VIEWPORT,
    });
    const { context, page } = session;
    // The user can only see and drive this one tab, and it exists to sign in to LinkedIn: close pop-ups
    // and return from anywhere else, so the server's browser cannot be used to browse other sites.
    context.on("page", (other) => {
      if (other !== page) void other.close().catch(() => undefined);
    });
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame() && !isLinkedInHost(frame.url())) {
        void page.goto(`${LINKEDIN_ORIGIN}/login`).catch(() => undefined);
      }
    });
  } else {
    const browser = await launchChromium(opts.wsEndpoint, { headless: false });
    const context = await browser.newContext({
      userAgent: userAgentFor(browser),
      viewport: VIEWPORT,
      locale: "en-US",
      timezoneId: opts.timezoneId || "UTC",
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
      ...(opts.proxy ? { proxy: opts.proxy } : {}),
    });
    session = { browser, context, page: await context.newPage() };
  }
  const { context, page } = session;
  try {
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
  } catch (err) {
    await session.browser.close().catch(() => undefined);
    throw err;
  }
  return session;
}

/** What the user did in the streamed sign-in page. Coordinates are in pixels of the frame image. */
export type LoginInput =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "scroll"; deltaY: number };

/** Keys a sign-in form needs. Anything else (function keys, shortcuts) is not forwarded. */
export const LOGIN_INPUT_KEYS = new Set([
  "Enter",
  "Backspace",
  "Delete",
  "Tab",
  "Escape",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

/** A JPEG of what the remote sign-in page currently shows. */
export async function captureLoginFrame(session: PlaywrightSession): Promise<Buffer> {
  return session.page.screenshot({ type: "jpeg", quality: 50, timeout: 10_000 });
}

/** Replays one user action in the remote sign-in page. Throws on input it does not recognise. */
export async function sendLoginInput(session: PlaywrightSession, input: LoginInput): Promise<void> {
  const { page } = session;
  switch (input.type) {
    case "click": {
      const size = page.viewportSize() ?? REMOTE_LOGIN_VIEWPORT;
      const x = Math.min(Math.max(Number(input.x), 0), size.width);
      const y = Math.min(Math.max(Number(input.y), 0), size.height);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("INVALID_INPUT");
      await page.mouse.click(x, y);
      return;
    }
    case "type": {
      const text = String(input.text ?? "");
      if (!text || text.length > 500) throw new Error("INVALID_INPUT");
      await page.keyboard.type(text, { delay: 12 });
      return;
    }
    case "key":
      if (!LOGIN_INPUT_KEYS.has(input.key)) throw new Error("INVALID_INPUT");
      await page.keyboard.press(input.key);
      return;
    case "scroll": {
      const deltaY = Math.min(Math.max(Number(input.deltaY), -2000), 2000);
      if (!Number.isFinite(deltaY)) throw new Error("INVALID_INPUT");
      await page.mouse.wheel(0, deltaY);
      return;
    }
    default:
      throw new Error("INVALID_INPUT");
  }
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
  // DOM ready is enough to tell signed-in from signed-out; LinkedIn's full "load" can take many seconds.
  await goto(page, FEED_URL, "domcontentloaded");
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

type LoginState =
  | { state: "logged_in" }
  | { state: "invalid_credentials" }
  | ({ state: "verification"; inputSelector?: string } & LoginVerification)
  | { state: "captcha" }
  | { state: "unknown"; hint: string };

async function firstVisible(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const count = await page
      .locator(selector)
      .locator("visible=true")
      .count()
      .catch(() => 0);
    if (count > 0) return selector;
  }
  return null;
}

async function anyExists(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    if (await exists(page, selector).catch(() => false)) return true;
  }
  return false;
}

async function pageHeading(page: Page): Promise<string> {
  const text = await page
    .locator("h1, h2")
    .first()
    .innerText({ timeout: 2000 })
    .catch(() => "");
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

function codeChannel(text: string): CodeChannel {
  if (/authenticator/i.test(text)) return "authenticator";
  if (/text message|\bsms\b|phone number ending|sent to your phone/i.test(text)) return "sms";
  if (/e-?mail/i.test(text)) return "email";
  return "unknown";
}

/** Works out where a sign-in attempt has landed. Reads the page only; never clicks. */
async function readLoginState(page: Page, context: BrowserContext): Promise<LoginState> {
  const url = page.url();
  if (isLoggedInUrl(url)) return { state: "logged_in" };
  const onLogin = isLoginUrl(url);
  const onChallenge = isChallengeUrl(url) || /captcha/i.test(url);
  if (!onLogin && !onChallenge) {
    // Interstitials after a successful sign-in (add a phone number, confirm your email, ...): the auth
    // cookie is only ever set once LinkedIn has accepted the sign-in.
    const cookies = await context.cookies([LINKEDIN_ORIGIN]);
    if (cookies.some((c) => c.name === "li_at" && Boolean(c.value))) return { state: "logged_in" };
  }

  const inputSelector = await firstVisible(page, CODE_INPUT_SELECTORS);
  const text = await bodyText(page);
  const hint = await pageHeading(page);
  if (inputSelector) return { state: "verification", kind: "code", channel: codeChannel(text), hint, inputSelector };
  if (await anyExists(page, CAPTCHA_SELECTORS)) return { state: "captcha" };
  if (onLogin) {
    if (await exists(page, SELECTORS.loginError)) return { state: "invalid_credentials" };
    for (const root of await loginRoots(page)) {
      if (await hasLoginUsername(root)) return { state: "invalid_credentials" };
    }
  }
  if (CAPTCHA_TEXT_RE.test(text)) return { state: "captcha" };
  if (APP_APPROVAL_RE.test(text)) return { state: "verification", kind: "app", channel: "unknown", hint };
  return { state: "unknown", hint };
}

/** LinkedIn hops through /login-submit and friends after a form post; wait until it lands somewhere readable. */
async function settleLoginState(page: Page, context: BrowserContext): Promise<LoginState> {
  let state = await readLoginState(page, context);
  for (let i = 0; i < 6 && state.state === "unknown" && /-submit\b/i.test(page.url()); i++) {
    await page.waitForTimeout(1500);
    state = await readLoginState(page, context);
  }
  return state;
}

function loginFailure(state: Exclude<LoginState, { state: "logged_in" } | { state: "verification" }>, page: Page) {
  if (state.state === "invalid_credentials") return new LinkedInLoginError(ERRORS.INVALID_CREDENTIALS);
  if (state.state === "captcha") return new LinkedInLoginError(ERRORS.CAPTCHA_REQUIRED, page.url());
  return new LinkedInLoginError(ERRORS.CHALLENGE_REQUIRED, `${page.url()} (${state.hint || "no heading"})`);
}

/**
 * Signs in with email and password. Returns the session cookies, or, when LinkedIn wants the owner to
 * verify the sign-in, the still-open browser session to finish with continueLogin().
 * The caller owns a returned session and must close it (closeLoginSession).
 * Throws LinkedInLoginError(INVALID_CREDENTIALS | CAPTCHA_REQUIRED | CHALLENGE_REQUIRED) or LOGIN_FORM_NOT_FOUND.
 */
export async function startLogin(email: string, password: string, opts: BrowserOptions = {}): Promise<LoginStart> {
  const session = await openBrowser(opts);
  const { context, page } = session;
  let keepOpen = false;
  try {
    const loginUrls = ["https://www.linkedin.com/login", "https://www.linkedin.com/uas/login"];
    let loaded = false;
    let loadError: Error | undefined;
    for (const loginUrl of loginUrls) {
      try {
        await goto(page, loginUrl, "load");
        loaded = true;
        break;
      } catch (err) {
        loadError = err as Error;
        // A dead proxy fails the same way on every URL: report it rather than a missing login page.
        if (loadError.message === ERRORS.PROXY_FAILED) throw loadError;
      }
    }
    if (!loaded) throw new Error(`LOGIN_PAGE_LOAD_FAILED: ${loadError?.message.split("\n")[0] ?? "unknown"}`);

    await dismissCookieBanner(page);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await dismissCookieBanner(page);
    await humanDelay(page);

    if (isLoggedInUrl(page.url())) return { status: "success", cookies: await exportSessionCookies(context) };
    if (await anyExists(page, CAPTCHA_SELECTORS)) throw new LinkedInLoginError(ERRORS.CAPTCHA_REQUIRED, page.url());

    page.setDefaultTimeout(LOGIN_FIELD_TIMEOUT);
    const formRoot = await waitForLoginForm(page);
    try {
      await fillLoginOnRoot(formRoot, page, email, password);
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

    const state = await settleLoginState(page, context);
    if (state.state === "logged_in") return { status: "success", cookies: await exportSessionCookies(context) };
    if (state.state === "verification") {
      keepOpen = true;
      return { status: "verification", kind: state.kind, channel: state.channel, hint: state.hint, session };
    }
    throw loginFailure(state, page);
  } finally {
    if (!keepOpen) await session.browser.close().catch(() => undefined);
  }
}

/**
 * Finishes a sign-in that startLogin() left waiting. With `code`, types it into LinkedIn's verification
 * form; without, just re-checks (for "approve in the LinkedIn app"). Never closes the session: the caller
 * does, once this returns success or throws anything other than INVALID_CODE.
 */
export async function continueLogin(session: PlaywrightSession, code?: string): Promise<LoginContinue> {
  const { context, page } = session;
  let state = await readLoginState(page, context);
  if (code && state.state === "verification" && state.kind === "code" && state.inputSelector) {
    await page.locator(state.inputSelector).locator("visible=true").first().fill(code);
    await page.waitForTimeout(600 + Math.random() * 900);
    const submit = await firstVisible(page, CODE_SUBMIT_SELECTORS);
    if (!submit) throw new LinkedInLoginError(ERRORS.CHALLENGE_REQUIRED, `no submit button at ${page.url()}`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }).catch(() => undefined),
      page.locator(submit).locator("visible=true").first().click(),
    ]);
    await humanDelay(page);
    state = await settleLoginState(page, context);
    // Still asking for a code after we submitted one: LinkedIn did not accept it.
    if (state.state === "verification" && state.kind === "code") throw new LinkedInLoginError(ERRORS.INVALID_CODE);
  }
  if (state.state === "logged_in") return { status: "success", cookies: await exportSessionCookies(context) };
  if (state.state === "verification") {
    return { status: "verification", kind: state.kind, channel: state.channel, hint: state.hint };
  }
  throw loginFailure(state, page);
}

export async function closeLoginSession(session: PlaywrightSession | undefined) {
  if (!session) return;
  await session.browser.close().catch(() => undefined);
}

/**
 * Unattended sign-in (session refresh from a worker): nobody is there to type a code, so a verification
 * step is a failure. Throws Error(CHALLENGE_REQUIRED | INVALID_CREDENTIALS | CAPTCHA_REQUIRED).
 */
export async function loginToLinkedIn(
  email: string,
  password: string,
  opts: BrowserOptions = {},
): Promise<SessionCookie[]> {
  const result = await startLogin(email, password, opts);
  if (result.status === "success") return result.cookies;
  await closeLoginSession(result.session);
  throw new LinkedInLoginError(ERRORS.CHALLENGE_REQUIRED, `verification by ${result.kind}`);
}

export async function verifyCookies(
  cookies: SessionCookie[] | null,
  opts: BrowserOptions = {},
): Promise<{ valid: boolean; error?: string }> {
  if (!cookies || !cookies.length) return { valid: false };
  return withBrowser({ ...opts, cookies }, async ({ page }) => {
    logCookieDebug("verify", normalizeLinkedInCookiesForPlaywright(cookies));
    let problem: LinkedInError | null;
    try {
      problem = await warmSessionOnFeed(page);
    } catch (err) {
      // A redirect loop is LinkedIn rejecting the session, not an outage: report it as invalid.
      if ((err as Error).message === ERRORS.SESSION_EXPIRED) return { valid: false };
      throw err;
    }
    if (problem === ERRORS.SESSION_EXPIRED) return { valid: false };
    if (problem === ERRORS.ACCOUNT_RESTRICTED) return { valid: false, error: problem };
    return { valid: true };
  });
}

export async function fetchOwnProfile(
  cookies: SessionCookie[],
  opts: BrowserOptions = {},
): Promise<{ fullName: string; headline: string; profileUrl: string }> {
  return withBrowser({ ...opts, cookies }, async ({ page }) => {
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

/** `value` as a CSS attribute-selector string (names can contain quotes). */
const cssString = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The profile's top card: where the member's own name and action buttons are. */
const TOP_CARD = "section:has(h1)";

async function profileName(page: Page): Promise<string> {
  const text = await page
    .locator("h1")
    .first()
    .innerText({ timeout: 3000 })
    .catch(() => "");
  return text.replace(/\s+/g, " ").trim();
}

/** First selector in the list that currently matches a visible element. */
async function firstMatch(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const count = await page
      .locator(selector)
      .locator("visible=true")
      .count()
      .catch(() => 0);
    if (count > 0) return selector;
  }
  return null;
}

/**
 * Ways LinkedIn has rendered "Connect" on a profile, most specific first. The first two name the member,
 * so they can never match a Connect button for someone else (for example in "People you may know").
 * Best-effort: LinkedIn changes this markup, and it has not been verified against a live account.
 */
function connectSelectors(name: string, slug: string): string[] {
  const selectors: string[] = [];
  if (name) selectors.push(`[aria-label=${cssString(`Invite ${name} to connect`)} i]`);
  if (slug) selectors.push(`a[href*="/preload/custom-invite/" i][href*=${cssString(`vanityName=${slug}`)} i]`);
  selectors.push(
    `${TOP_CARD} button[aria-label*="to connect" i]`,
    `${TOP_CARD} a[aria-label*="to connect" i]`,
    `${TOP_CARD} button:text-is("Connect")`,
    `${TOP_CARD} a:text-is("Connect")`,
    SELECTORS.connectButton,
  );
  return selectors;
}

function connectInMenuSelectors(name: string): string[] {
  const selectors: string[] = [];
  if (name) selectors.push(`[aria-label=${cssString(`Invite ${name} to connect`)} i]`);
  selectors.push(
    // The menu was opened from this profile's own More button a moment ago, so it is this member's menu.
    '[role="menu"] [aria-label*="to connect" i]',
    '[role="menuitem"]:text-is("Connect")',
    '.artdeco-dropdown__content [role="button"]:text-is("Connect")',
    SELECTORS.connectInMenu,
  );
  return selectors;
}

function pendingSelectors(name: string): string[] {
  const selectors: string[] = [];
  if (name) selectors.push(`[aria-label*="Pending" i][aria-label*=${cssString(name)} i]`);
  selectors.push(`${TOP_CARD} button:text-is("Pending")`, `${TOP_CARD} a:text-is("Pending")`, SELECTORS.pendingButton);
  return selectors;
}

const MORE_SELECTORS = [
  `${TOP_CARD} button[aria-label="More actions" i]`,
  `${TOP_CARD} button[aria-label="More" i]`,
  `${TOP_CARD} button:text-is("More")`,
  SELECTORS.moreActions,
];
const ADD_NOTE_SELECTORS = [SELECTORS.addNote, '[role="dialog"] button:text-is("Add a note")'];
const NOTE_TEXTAREA_SELECTORS = [SELECTORS.noteTextarea, "textarea#custom-message", '[role="dialog"] textarea'];
const SEND_WITH_NOTE_SELECTORS = [SELECTORS.sendInvitation, '[role="dialog"] button:text-is("Send")'];
const SEND_WITHOUT_NOTE_SELECTORS = [
  SELECTORS.sendWithoutNote,
  '[role="dialog"] button:text-is("Send without a note")',
  '[role="dialog"] button:text-is("Send")',
];
const INVITE_DIALOG_SELECTORS = [...ADD_NOTE_SELECTORS, ...SEND_WITHOUT_NOTE_SELECTORS];

/** Labels of the buttons and links LinkedIn showed in the profile's top card, e.g. "Message, Follow, More". */
async function describeProfileActions(page: Page): Promise<string> {
  let labels: string[] = [];
  try {
    labels = await page
      .locator(`${TOP_CARD} button, ${TOP_CARD} a[role="button"], ${TOP_CARD} a[aria-label]`)
      .evaluateAll((elements) =>
        elements
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean),
      );
  } catch {
    // Diagnostics only: never let them turn a clear "no Connect button" into an unrelated error.
  }
  const unique = [...new Set(labels)].slice(0, 12).map((label) => label.slice(0, 60));
  return unique.length ? unique.join(", ") : "no buttons";
}

async function isFirstDegree(page: Page): Promise<boolean> {
  const badge = await page
    .locator(SELECTORS.distanceBadge)
    .first()
    .innerText({ timeout: 1500 })
    .catch(() => "");
  if (/1st/.test(badge)) return true;
  const card = await page
    .locator(TOP_CARD)
    .first()
    .innerText({ timeout: 1500 })
    .catch(() => "");
  return /(^|[\s·•])1st(\s|$)/m.test(card);
}

export async function sendConnectionRequest(
  cookies: SessionCookie[],
  profileUrl: string,
  note: string,
  opts: BrowserOptions = {},
): Promise<ActionResult> {
  try {
    return await withBrowser({ ...opts, cookies }, async ({ page }) => {
      const feedProblem = await warmSessionOnFeed(page);
      if (feedProblem) return { success: false, error: feedProblem };

      const target = normalizeLinkedinUrl(profileUrl) ?? profileUrl;
      const slug = decodeURIComponent(target.split("/in/")[1]?.split(/[/?#]/)[0] ?? "");
      await goto(page, target);
      await humanDelay(page);
      const problem = await detectProblem(page);
      if (problem) return { success: false, error: problem };

      const name = await profileName(page);
      if (await firstMatch(page, pendingSelectors(name))) return { success: false, error: ERRORS.ALREADY_PENDING };

      let connect = await firstMatch(page, connectSelectors(name, slug));
      if (!connect) {
        const more = await firstMatch(page, MORE_SELECTORS);
        if (more) {
          await page.locator(more).locator("visible=true").first().click();
          await page.waitForTimeout(800 + Math.random() * 700);
          connect = await firstMatch(page, connectInMenuSelectors(name));
        }
      }

      if (connect) {
        await page.locator(connect).locator("visible=true").first().click();
        await humanDelay(page);
      } else {
        if (await isFirstDegree(page)) return { success: false, error: ERRORS.ALREADY_CONNECTED };
        const shown = await describeProfileActions(page);
        // Last resort: LinkedIn's own invite link for this member opens the same invitation dialog.
        if (slug) {
          await goto(page, `${LINKEDIN_ORIGIN}/preload/custom-invite/?vanityName=${encodeURIComponent(slug)}`);
          await humanDelay(page);
          const inviteProblem = await detectProblem(page);
          if (inviteProblem) return { success: false, error: inviteProblem };
        }
        if (!slug || !(await firstMatch(page, INVITE_DIALOG_SELECTORS))) {
          return { success: false, error: ERRORS.CONNECT_UNAVAILABLE, detail: `${name || "profile"} showed: ${shown}` };
        }
      }

      const addNote = note ? await firstMatch(page, ADD_NOTE_SELECTORS) : null;
      let sendSelectors = SEND_WITHOUT_NOTE_SELECTORS;
      if (addNote) {
        await page.locator(addNote).locator("visible=true").first().click();
        await page.waitForTimeout(800 + Math.random() * 700);
        const textarea = await firstMatch(page, NOTE_TEXTAREA_SELECTORS);
        if (textarea) {
          await page.locator(textarea).locator("visible=true").first().fill(note);
          await humanDelay(page);
          sendSelectors = SEND_WITH_NOTE_SELECTORS;
        }
      }
      const send = await firstMatch(page, sendSelectors);
      if (!send) {
        const text = (await bodyText(page)).replace(/\s+/g, " ");
        const asksEmail = /enter their email|email address to connect/i.test(text);
        return {
          success: false,
          error: ERRORS.CONNECT_UNAVAILABLE,
          detail: asksEmail
            ? "LinkedIn asked for this member's email address before connecting"
            : `the invitation dialog had no Send button (${await describeProfileActions(page)})`,
        };
      }
      await page.locator(send).locator("visible=true").first().click();
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
    return await withBrowser({ ...opts, cookies }, async ({ page }) => {
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
    return await withBrowser({ ...opts, cookies }, async ({ page }) => {
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
    return await withBrowser({ ...opts, cookies }, async ({ page }) => {
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
