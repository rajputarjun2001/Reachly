import type { Types } from "mongoose";
import { Campaign, Lead, type LinkedInAccountDoc } from "../../models";
import * as linkedinActions from "../playwright/linkedinActions";
import { runWithSession } from "../accountSession";
import { logEvent } from "../events";
import { scheduleNextMessage } from "./sequence";

const BATCH_SIZE = 20;

/**
 * Visits profiles of leads with a pending invitation (oldest-checked first) and moves accepted
 * ones to 'connected', queueing their first follow-up message.
 */
export async function checkAcceptances(account: LinkedInAccountDoc) {
  const campaigns = await Campaign.find({ linkedinAccountId: account._id, status: "active" });
  if (!campaigns.length) return { checked: 0, accepted: 0 };
  const campaignByList = new Map(campaigns.map((c) => [String(c.leadListId), c]));

  const listIds = campaigns.map((c) => c.leadListId).filter((id): id is Types.ObjectId => Boolean(id));
  const leads = await Lead.find({
    listId: { $in: listIds },
    status: "connection_sent",
  })
    .sort({ lastAcceptanceCheckAt: 1, connectionSentAt: 1 })
    .limit(BATCH_SIZE);
  if (!leads.length) return { checked: 0, accepted: 0 };

  const result = await runWithSession(account, (cookies, opts) =>
    linkedinActions.checkConnectionStatus(
      cookies,
      leads.map((l) => l.linkedinUrl),
      opts,
    ),
  );
  const statuses = result.results || {};

  let accepted = 0;
  const now = new Date();
  for (const lead of leads) {
    const state = statuses[lead.linkedinUrl];
    if (!state) continue;
    lead.lastAcceptanceCheckAt = now;
    if (state === "connected") {
      const campaign = campaignByList.get(String(lead.listId))!;
      lead.status = "connected";
      lead.connectedAt = now;
      await lead.save();
      await Campaign.updateOne({ _id: campaign._id }, { $inc: { "stats.connectionsAccepted": 1 } });
      await logEvent({
        workspaceId: campaign.workspaceId,
        linkedinAccountId: account._id,
        campaignId: campaign._id,
        leadId: lead._id,
        eventType: "connection_accepted",
        payload: {},
      });
      await scheduleNextMessage(campaign, lead, now);
      accepted += 1;
    } else if (state === "not_connected") {
      lead.status = "skipped";
      lead.skipReason = "invitation_withdrawn";
      await lead.save();
    } else {
      await lead.save();
    }
  }
  return { checked: Object.keys(statuses).length, accepted, error: result.success ? undefined : result.error };
}
