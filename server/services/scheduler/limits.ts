import type { Types } from "mongoose";
import { LinkedInAccount } from "../../models";
import { dateKey, type SendingWindow } from "../../utils/schedule";

type WorkspaceLike = {
  dailyLimitPerAccount?: number | null;
  sendingWindowStart?: number | null;
  sendingWindowEnd?: number | null;
  sendOnWeekends?: boolean | null;
  timezone?: string | null;
};
type CampaignLike = { settings?: { timezone?: string | null; dailyLimit?: number | null } | null };
type AccountLike = { dailyLimit?: number | null; todaySentCount?: number | null; todayCountDate?: string | null };

export function effectiveDailyLimit(account: AccountLike, workspace: WorkspaceLike | null | undefined): number {
  return Math.min(account.dailyLimit || 10, workspace?.dailyLimitPerAccount || 10);
}

/** Sending window for a campaign; the campaign timezone overrides the workspace one. */
export function sendingWindowFor(workspace: WorkspaceLike | null | undefined, campaign?: CampaignLike | null): SendingWindow {
  return {
    sendingWindowStart: workspace?.sendingWindowStart ?? 8,
    sendingWindowEnd: workspace?.sendingWindowEnd ?? 20,
    sendOnWeekends: Boolean(workspace?.sendOnWeekends),
    timezone: campaign?.settings?.timezone || workspace?.timezone || "UTC",
  };
}

/** Connection requests already sent today (counter resets when the local day changes). */
export function sentToday(account: AccountLike, workspace: WorkspaceLike | null | undefined, now = new Date()): number {
  return account.todayCountDate === dateKey(now, workspace?.timezone) ? account.todaySentCount || 0 : 0;
}

/**
 * Atomically reserves one connection slot for today so concurrent jobs can't exceed the limit.
 * Returns a release function, or null when the limit is reached.
 */
export async function reserveDailySlot(
  accountId: Types.ObjectId | string,
  limit: number,
  workspace: WorkspaceLike | null | undefined,
  now = new Date(),
): Promise<(() => Promise<unknown>) | null> {
  const key = dateKey(now, workspace?.timezone);
  await LinkedInAccount.updateOne(
    { _id: accountId, todayCountDate: { $ne: key } },
    { $set: { todaySentCount: 0, todayCountDate: key } },
  );
  const reserved = await LinkedInAccount.findOneAndUpdate(
    { _id: accountId, todayCountDate: key, todaySentCount: { $lt: limit } },
    { $inc: { todaySentCount: 1 } },
    { returnDocument: "after" },
  );
  if (!reserved) return null;
  return () => LinkedInAccount.updateOne({ _id: accountId, todayCountDate: key }, { $inc: { todaySentCount: -1 } });
}
