"use server";

import { revalidatePath } from "next/cache";
import { isBackendConfigured } from "@/lib/env";
import {
  checkAccount,
  connectAccount,
  reconnectAccount,
  removeAccount,
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

export async function reconnectAccountAction(id: string, password?: string): Promise<AccountActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await reconnectAccount(id, password);
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
