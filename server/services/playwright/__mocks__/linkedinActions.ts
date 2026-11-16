import { vi } from "vitest";
import type * as Actual from "../linkedinActions";

const actual = await vi.importActual<typeof Actual>("../linkedinActions");

export const ERRORS = actual.ERRORS;
export const SELECTORS = actual.SELECTORS;
export const COOKIES = [
  { name: "li_at", value: "fresh-cookie", domain: ".www.linkedin.com", path: "/" },
  { name: "JSESSIONID", value: "fresh-jsession", domain: ".www.linkedin.com", path: "/", httpOnly: false },
];

export const LinkedInLoginError = actual.LinkedInLoginError;
export const loginToLinkedIn = vi.fn(async (..._args: unknown[]) => COOKIES);
/** Delegates to the loginToLinkedIn mock, so a test that stubs one sign-in outcome covers both entry points. */
export const startLogin = vi.fn(
  async (...args: unknown[]): Promise<Actual.LoginStart> =>
    ({ status: "success", cookies: await loginToLinkedIn(...args) }) as unknown as Actual.LoginStart,
);
export const continueLogin = vi.fn(
  async (): Promise<Actual.LoginContinue> => ({ status: "success", cookies: COOKIES }) as unknown as Actual.LoginContinue,
);
export const closeLoginSession = vi.fn(async () => undefined);
export const verifyCookies = vi.fn(async () => ({ valid: true }) as { valid: boolean; error?: string });
export const fetchOwnProfile = vi.fn(async () => ({
  fullName: "Li User",
  headline: "Founder",
  profileUrl: "https://www.linkedin.com/in/li-user",
}));
export const sendConnectionRequest = vi.fn(async () => ({ success: true }) as { success: boolean; error?: string });
export const sendMessage = vi.fn(async () => ({ success: true }) as { success: boolean; error?: string });
export const checkConnectionStatus = vi.fn(
  async () => ({ success: true, results: {} }) as { success: boolean; error?: string; results: Record<string, string> },
);
export const scrapeInbox = vi.fn(
  async () => ({ success: true, conversations: [] }) as { success: boolean; error?: string; conversations?: unknown[] },
);
