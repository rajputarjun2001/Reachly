import { vi } from "vitest";
import type * as Actual from "../linkedinActions";

const actual = await vi.importActual<typeof Actual>("../linkedinActions");

export const ERRORS = actual.ERRORS;
export const SELECTORS = actual.SELECTORS;
export const COOKIES = [
  { name: "li_at", value: "fresh-cookie", domain: ".linkedin.com", path: "/" },
  { name: "JSESSIONID", value: "fresh-jsession", domain: ".linkedin.com", path: "/" },
];

export const loginToLinkedIn = vi.fn(async () => COOKIES);
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
