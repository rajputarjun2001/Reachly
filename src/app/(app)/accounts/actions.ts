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
  startBrowserConnect,
  updateAccount,
} from "@/lib/accounts/repository";
import type { AccountHealth } from "@/lib/accounts/types";
import { actionErrorMessage } from "@/lib/server/backend";

export type AccountActionResult = { error?: string; success?: string };

const NOT_CONFIGURED = { error: "Backend is not configured." };

function optionalLimit(value: FormDataEntryValue | null): number | undefined {
  const n = Number(value ?? "");
  return value && Number.isFinite(n) ? n : undefined;
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
    });
    revalidatePath("/accounts");
    return { success: `Connected ${account?.display_name ?? email}.` };
  } catch (err) {
    revalidatePath("/accounts");
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
    return { error: actionErrorMessage(err, "Could not reconnect the account.") };
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
    await updateAccount(id, {
      label: String(formData.get("label") ?? "").trim(),
      dailyLimit: optionalLimit(formData.get("daily_limit")),
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
    });
    return { sessionId: snap.sessionId, status: snap.status };
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
      accountId: snap.accountId,
      error: snap.error,
    };
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
