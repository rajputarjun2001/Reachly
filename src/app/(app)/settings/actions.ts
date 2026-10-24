"use server";

import { revalidatePath } from "next/cache";
import { isBackendConfigured } from "@/lib/env";
import {
  addBlacklistEntry,
  changeUserPassword,
  inviteWorkspaceMember,
  removeBlacklistEntry,
  removeWorkspaceMember,
  updateProfileSettings,
  updateWorkspaceSettings,
} from "@/lib/settings/repository";
import { actionErrorMessage } from "@/lib/server/backend";

export type SettingsActionResult = { error?: string; success?: string; inviteUrl?: string };

const NOT_CONFIGURED = { error: "Backend is not configured." };

export async function updateProfileAction(formData: FormData): Promise<SettingsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await updateProfileSettings({
      fullName: String(formData.get("fullName") ?? "").trim(),
      timezone: String(formData.get("timezone") ?? "").trim(),
    });
    revalidatePath("/settings");
    return { success: "Profile updated." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function changePasswordAction(formData: FormData): Promise<SettingsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await changeUserPassword(
      String(formData.get("oldPassword") ?? ""),
      String(formData.get("newPassword") ?? ""),
    );
    return { success: "Password changed." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function updateWorkspaceAction(formData: FormData): Promise<SettingsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const daily = formData.get("dailyLimitPerAccount");
    await updateWorkspaceSettings({
      name: String(formData.get("name") ?? "").trim(),
      dailyLimitPerAccount: daily ? Number(daily) : undefined,
      sendingWindowStart: Number(formData.get("sendingWindowStart")),
      sendingWindowEnd: Number(formData.get("sendingWindowEnd")),
      sendOnWeekends: formData.getAll("sendOnWeekends").includes("true"),
      timezone: String(formData.get("timezone") ?? "").trim() || undefined,
    });
    revalidatePath("/settings");
    return { success: "Workspace settings saved." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function inviteMemberAction(email: string, fullName?: string): Promise<SettingsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    const { inviteUrl } = await inviteWorkspaceMember(email.trim(), fullName?.trim() || undefined);
    revalidatePath("/settings");
    return { success: "Invitation created. Copy the link and send it to your teammate.", inviteUrl };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function removeMemberAction(userId: string): Promise<SettingsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await removeWorkspaceMember(userId);
    revalidatePath("/settings");
    return { success: "Member removed." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function addBlacklistAction(formData: FormData): Promise<SettingsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const type = String(formData.get("type") ?? "");
  if (type !== "domain" && type !== "profile_url") return { error: "Invalid blacklist type." };
  try {
    await addBlacklistEntry(type, String(formData.get("value") ?? "").trim());
    revalidatePath("/settings");
    return { success: "Added to blacklist." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}

export async function removeBlacklistAction(id: string): Promise<SettingsActionResult> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  try {
    await removeBlacklistEntry(id);
    revalidatePath("/settings");
    return { success: "Removed from blacklist." };
  } catch (err) {
    return { error: actionErrorMessage(err) };
  }
}
