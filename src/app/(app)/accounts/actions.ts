"use server";

import { revalidatePath } from "next/cache";
import { isBackendConfigured } from "@/lib/env";
import {
  cancelBrowserConnect,
  checkAccount,
  connectAccount,
  connectAccountWithSessionCookies,
  pollBrowserConnect,
  reconnectAccount,
  removeAccount,
  sendBrowserConnectInput,
  type BrowserConnectInput,
  startBrowserConnect,
  updateAccount,
  verificationFromError,
  verifyAccount,
} from "@/lib/accounts/repository";
import type { AccountHealth, AccountVerification } from "@/lib/accounts/types";
import { actionErrorMessage } from "@/lib/server/backend";

export type AccountActionResult = {
  error?: string;
  success?: string;
  /** Set when LinkedIn wants the account owner to verify the sign-in; finish with verifyAccountAction. */
  verification?: AccountVerification;
};

const NOT_CONFIGURED = { error: "Backend is not configured." };

function optionalLimit(value: FormDataEntryValue | null): number | undefined {
  const n = Number(value ?? "");
  return value && Number.isFinite(n) ? n : undefined;
}

function optionalProxy(value: FormDataEntryValue | null): string | undefined {
  return String(value ?? "").trim() || undefined;
}

export async function connectAccountAction(formData: FormData): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "LinkedIn email and password are required." };
  try {
    const account = await connectAccount({
      email,
      password,
      label: String(formData.get("label") ?? "").trim() || undefined,
      dailyLimit: optionalLimit(formData.get("daily_limit")),
      proxyUrl: optionalProxy(formData.get("proxy_url")),
    });
    revalidatePath("/accounts");
    return { success: `Connected ${account?.display_name ?? email}.` };
  } catch (err) {
    revalidatePath("/accounts");
    const verification = verificationFromError(err);
    if (verification) return { verification };
    return { error: actionErrorMessage(err, "Could not connect the LinkedIn account.") };
  }
}

export async function connectAccountWithSessionCookiesAction(formData: FormData): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const email = String(formData.get("email") ?? "").trim();
  const sessionCookies = String(formData.get("session_cookies") ?? "").trim();
  if (!email) return { error: "LinkedIn email is required." };
  if (!sessionCookies) return { error: "Paste your LinkedIn session cookies (li_at and JSESSIONID, or a full export)." };
  try {
    const account = await connectAccountWithSessionCookies({
      email,
      sessionCookies,
      label: String(formData.get("label") ?? "").trim() || undefined,
      dailyLimit: optionalLimit(formData.get("daily_limit")),
      proxyUrl: optionalProxy(formData.get("proxy_url")),
    });
    revalidatePath("/accounts");
    return { success: `Connected ${account?.display_name ?? email}.` };
  } catch (err) {
    revalidatePath("/accounts");
    return { error: actionErrorMessage(err, "Could not connect with those session cookies.") };
  }
}

export async function reconnectAccountAction(
  id: string,
  input?: { password?: string; sessionCookies?: string },
): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await reconnectAccount(id, input);
    revalidatePath("/accounts");
    return { success: "Account reconnected." };
  } catch (err) {
    revalidatePath("/accounts");
    const verification = verificationFromError(err);
    if (verification) return { verification };
    return { error: actionErrorMessage(err, "Could not reconnect the account.") };
  }
}

/** Finishes a password sign-in with the code LinkedIn sent (omit the code to re-check an app approval). */
export async function verifyAccountAction(id: string, code?: string): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await verifyAccount(id, code);
    revalidatePath("/accounts");
    return { success: "Account connected." };
  } catch (err) {
    revalidatePath("/accounts");
    const verification = verificationFromError(err);
    // A rejected code keeps the sign-in open: return both so the UI can show why and ask again.
    if (verification) return { verification, error: verification.message };
    return { error: actionErrorMessage(err, "Could not verify the sign-in.") };
  }
}

export async function checkAccountAction(id: string): Promise<{ error?: string; health?: AccountHealth }> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const health = await checkAccount(id);
    revalidatePath("/accounts");
    return { health };
  } catch (err) {
    return { error: actionErrorMessage(err, "Could not check the session.") };
  }
}

export async function updateAccountAction(id: string, formData: FormData): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    // Blank proxy field keeps the stored proxy; the checkbox removes it.
    const proxyUrl = formData.get("remove_proxy") ? "" : optionalProxy(formData.get("proxy_url"));
    await updateAccount(id, {
      label: String(formData.get("label") ?? "").trim(),
      dailyLimit: optionalLimit(formData.get("daily_limit")),
      proxyUrl,
    });
    revalidatePath("/accounts");
    return { success: "Account updated." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export type BrowserConnectActionResult = {
  error?: string;
  sessionId?: string;
  status?: string;
  /** "remote": show the streamed sign-in page. "window": a Chromium window opened on the server machine. */
  mode?: "window" | "remote";
  /** The user has signed in and Reachly is saving the session. */
  saving?: boolean;
  accountId?: string;
};

export async function startBrowserConnectAction(formData: FormData): Promise<BrowserConnectActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "LinkedIn email is required." };
  try {
    const snap = await startBrowserConnect({
      email,
      label: String(formData.get("label") ?? "").trim() || undefined,
      dailyLimit: optionalLimit(formData.get("daily_limit")),
      proxyUrl: optionalProxy(formData.get("proxy_url")),
    });
    return { sessionId: snap.sessionId, status: snap.status, mode: snap.mode };
  } catch (err) {
    return { error: actionErrorMessage(err, "Could not open the LinkedIn browser.") };
  }
}

export async function pollBrowserConnectAction(sessionId: string): Promise<BrowserConnectActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const snap = await pollBrowserConnect(sessionId);
    if (snap.status === "success") revalidatePath("/accounts");
    return {
      sessionId: snap.sessionId,
      status: snap.status,
      saving: snap.saving,
      accountId: snap.accountId,
      error: snap.error,
    };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

/** Forwards a click, keystroke or scroll to the streamed sign-in page. */
export async function browserConnectInputAction(
  sessionId: string,
  input: BrowserConnectInput,
): Promise<{ error?: string }> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await sendBrowserConnectInput(sessionId, input);
    return {};
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function cancelBrowserConnectAction(sessionId: string): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await cancelBrowserConnect(sessionId);
    return { success: "Cancelled." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function removeAccountAction(id: string): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await removeAccount(id);
    revalidatePath("/accounts");
    revalidatePath("/campaigns");
    return { success: "Account removed. Its campaigns were paused." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}
