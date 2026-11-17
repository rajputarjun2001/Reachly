import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { createAccount, createCampaign, createListWithLeads, createWorkspaceFixture, job } from "./factory";
import { AutomationEvent, Blacklist, Campaign, Conversation, Lead, LinkedInAccount } from "../models";
import { getQueues } from "../services/scheduler/queues";
import * as li from "../services/playwright/linkedinActions";
import { processConnectionJob } from "../services/scheduler/connectionProcessor";
import { processMessageJob } from "../services/scheduler/messageProcessor";
import { decryptJSON } from "../utils/encryption";
import { DAY, HOUR } from "../utils/schedule";
import type { EventType } from "../models";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

const queues = () => vi.mocked(getQueues(), true);
const COOKIES = (li as unknown as { COOKIES: unknown[] }).COOKIES;
const sendConnectionRequest = vi.mocked(li.sendConnectionRequest);
const sendMessage = vi.mocked(li.sendMessage);
const loginToLinkedIn = vi.mocked(li.loginToLinkedIn);

const OPEN = { sendingWindowStart: 0, sendingWindowEnd: 24, sendOnWeekends: true, timezone: "UTC" };
// A Wednesday, inside 08-20 UTC office hours.
const NOW = new Date("2026-10-21T10:00:00Z");
const TODAY = "20261021";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup(wsOverrides: Record<string, unknown> = OPEN, campaignOverrides: Record<string, unknown> = {}) {
  const fx = await createWorkspaceFixture(wsOverrides);
  const account = await createAccount(fx.workspace._id);
  const { list, leads } = await createListWithLeads(fx.workspace._id, 2);
  const campaign = await createCampaign(fx.workspace._id, account._id, list._id, campaignOverrides);
  const lead = leads[0];
  const connJob = (opts?: { attempts?: number }, attemptsMade?: number) =>
    job({ leadId: String(lead._id), campaignId: String(campaign._id), accountId: String(account._id) }, opts, attemptsMade);
  return { ...fx, account, list, leads, lead, campaign, connJob };
}

const events = (type?: EventType) => AutomationEvent.find(type ? { eventType: type } : {});

describe("connectionProcessor", () => {
  it("sends the request with a rendered note and records everything", async () => {
    const s = await setup();
    expect(await processConnectionJob(s.connJob())).toEqual({ sent: true });

    expect(sendConnectionRequest).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "li_at", value: "cookie" }),
        expect.objectContaining({ name: "JSESSIONID", value: "js" }),
      ]),
      s.lead.linkedinUrl,
      "Hi First0, let us connect",
      expect.any(Object),
    );
    const lead = await Lead.findById(s.lead._id);
    expect(lead?.status).toBe("connection_sent");
    expect(lead?.connectionSentAt).toBeInstanceOf(Date);
    expect((await Campaign.findById(s.campaign._id))?.stats?.connectionsSent).toBe(1);
    const account = await LinkedInAccount.findById(s.account._id);
    expect(account?.todaySentCount).toBe(1);
    expect(account?.todayCountDate).toBe(TODAY);
    expect(account?.lastSentAt).toBeInstanceOf(Date);
    expect(await events("connection_sent")).toHaveLength(1);
  });

  it("skips when the daily limit is reached, without calling LinkedIn", async () => {
    const s = await setup();
    await LinkedInAccount.updateOne({ _id: s.account._id }, { todaySentCount: 10, todayCountDate: TODAY });
    const res = await processConnectionJob(s.connJob());
    expect(res).toMatchObject({ skipped: true, reason: "daily_limit_reached" });
    expect(sendConnectionRequest).not.toHaveBeenCalled();
    expect((await Lead.findById(s.lead._id))?.status).toBe("pending");
    expect(await events("job_skipped")).toHaveLength(1);
  });

  it("a counter left over from a previous day is reset instead of blocking", async () => {
    const s = await setup();
    await LinkedInAccount.updateOne({ _id: s.account._id }, { todaySentCount: 10, todayCountDate: "20261020" });
    expect(await processConnectionJob(s.connJob())).toEqual({ sent: true });
    const account = await LinkedInAccount.findById(s.account._id);
    expect(account?.todaySentCount).toBe(1);
    expect(account?.todayCountDate).toBe(TODAY);
  });

  it("the daily limit uses the workspace timezone's calendar day", async () => {
    // 20:00 UTC on the 21st is already the 22nd in Kolkata, so yesterday's 10 sends no longer count.
    vi.setSystemTime(new Date("2026-10-21T20:00:00Z"));
    const s = await setup({ ...OPEN, timezone: "Asia/Kolkata" });
    await LinkedInAccount.updateOne({ _id: s.account._id }, { todaySentCount: 10, todayCountDate: TODAY });
    expect(await processConnectionJob(s.connJob())).toEqual({ sent: true });
    expect((await LinkedInAccount.findById(s.account._id))?.todayCountDate).toBe("20261022");
  });

  it("marks blacklisted leads and skips them", async () => {
    const s = await setup();
    await Blacklist.create({ workspaceId: s.workspace._id, type: "profile_url", value: s.lead.linkedinUrl });
    const res = await processConnectionJob(s.connJob());
    expect(res.reason).toBe("blacklisted");
    expect((await Lead.findById(s.lead._id))?.status).toBe("blacklisted");
    expect(sendConnectionRequest).not.toHaveBeenCalled();
  });

  it("skips paused campaigns, inactive accounts and non-pending leads", async () => {
    const s = await setup();
    await Lead.updateOne({ _id: s.lead._id }, { status: "connection_sent" });
    expect((await processConnectionJob(s.connJob())).reason).toBe("lead_not_pending");
    await Lead.updateOne({ _id: s.lead._id }, { status: "pending" });
    await LinkedInAccount.updateOne({ _id: s.account._id }, { status: "flagged" });
    expect((await processConnectionJob(s.connJob())).reason).toBe("account_not_active");
    await Campaign.updateOne({ _id: s.campaign._id }, { status: "paused" });
    expect((await processConnectionJob(s.connJob())).reason).toBe("campaign_not_active");
    expect(sendConnectionRequest).not.toHaveBeenCalled();
  });

  it("on session expiry it re-logs in, stores fresh cookies and retries once", async () => {
    const s = await setup();
    sendConnectionRequest
      .mockResolvedValueOnce({ success: false, error: "SESSION_EXPIRED" })
      .mockResolvedValueOnce({ success: true });
    expect(await processConnectionJob(s.connJob())).toEqual({ sent: true });
    expect(loginToLinkedIn).toHaveBeenCalledWith(s.account.linkedinEmail, "li-password", expect.any(Object));
    expect(sendConnectionRequest).toHaveBeenCalledTimes(2);
    expect(sendConnectionRequest.mock.calls[1][0]).toEqual(COOKIES);
    const account = await LinkedInAccount.findById(s.account._id).select("+sessionCookies");
    expect(decryptJSON(account!.sessionCookies!)).toEqual(COOKIES);
    expect(await events("session_refreshed")).toHaveLength(1);
  });

  it("if re-login fails the account is flagged, its campaigns paused and the slot released", async () => {
    const s = await setup();
    sendConnectionRequest.mockResolvedValueOnce({ success: false, error: "SESSION_EXPIRED" });
    loginToLinkedIn.mockRejectedValueOnce(new Error("CHALLENGE_REQUIRED"));
    const res = await processConnectionJob(s.connJob());
    expect(res).toMatchObject({ skipped: true, reason: "account_flagged" });
    const account = await LinkedInAccount.findById(s.account._id);
    expect(account?.toObject()).toMatchObject({
      status: "flagged",
      flagReason: "CHALLENGE_REQUIRED",
      warningCount: 1,
      todaySentCount: 0,
    });
    const campaign = await Campaign.findById(s.campaign._id);
    expect(campaign?.status).toBe("paused");
    expect(campaign?.pausedReason).toBe("account_flagged:CHALLENGE_REQUIRED");
    expect(await events("account_flagged")).toHaveLength(1);
    expect((await Lead.findById(s.lead._id))?.status).toBe("pending");
  });

  it("a LinkedIn restriction warning flags the account immediately", async () => {
    const s = await setup();
    sendConnectionRequest.mockResolvedValueOnce({ success: false, error: "INVITATION_LIMIT" });
    await processConnectionJob(s.connJob());
    expect((await LinkedInAccount.findById(s.account._id))?.status).toBe("flagged");
    expect(loginToLinkedIn).not.toHaveBeenCalled();
  });

  it("already-connected leads jump to connected and get their first message queued", async () => {
    const s = await setup();
    sendConnectionRequest.mockResolvedValueOnce({ success: false, error: "ALREADY_CONNECTED" });
    expect(await processConnectionJob(s.connJob())).toMatchObject({ skipped: true, reason: "already_connected" });
    expect((await Lead.findById(s.lead._id))?.status).toBe("connected");
    expect((await LinkedInAccount.findById(s.account._id))?.todaySentCount).toBe(0);
    expect((await Campaign.findById(s.campaign._id))?.stats?.connectionsAccepted).toBe(1);
    expect(queues().messageQueue.add).toHaveBeenCalledWith(
      "send-message",
      expect.objectContaining({ messageStep: 1 }),
      expect.objectContaining({ delay: DAY, jobId: `msg-${s.lead._id}-1` }),
    );
  });

  it("pending invitations and unavailable Connect buttons release the slot and update the lead", async () => {
    const s = await setup();
    sendConnectionRequest
      .mockResolvedValueOnce({ success: false, error: "ALREADY_PENDING" })
      .mockResolvedValueOnce({ success: false, error: "CONNECT_UNAVAILABLE" });
    expect((await processConnectionJob(s.connJob())).reason).toBe("already_pending");
    expect((await Lead.findById(s.lead._id))?.status).toBe("connection_sent");

    const other = job({ leadId: String(s.leads[1]._id), campaignId: String(s.campaign._id), accountId: String(s.account._id) });
    expect((await processConnectionJob(other)).reason).toBe("connect_unavailable");
    const skipped = await Lead.findById(s.leads[1]._id);
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.skipReason).toBe("connect_unavailable");
    expect((await LinkedInAccount.findById(s.account._id))?.todaySentCount).toBe(0);
  });

  it("transient failures throw for BullMQ retry; the last attempt marks the lead skipped", async () => {
    const s = await setup();
    sendConnectionRequest
      .mockResolvedValueOnce({ success: false, error: "Timeout 15000ms exceeded" })
      .mockResolvedValueOnce({ success: false, error: "Timeout 15000ms exceeded" });
    await expect(processConnectionJob(s.connJob({ attempts: 2 }, 0))).rejects.toThrow("Connection request failed");
    expect((await LinkedInAccount.findById(s.account._id))?.todaySentCount).toBe(0);
    const res = await processConnectionJob(s.connJob({ attempts: 2 }, 1));
    expect(res.reason).toBe("send_failed");
    expect((await Lead.findById(s.lead._id))?.status).toBe("skipped");
    expect((await LinkedInAccount.findById(s.account._id))?.todaySentCount).toBe(0);
  });
});

describe("connectionProcessor without a Connect button", () => {
  it("keeps what LinkedIn showed on the lead and in the event log", async () => {
    const s = await setup();
    sendConnectionRequest.mockResolvedValueOnce({
      success: false,
      error: "CONNECT_UNAVAILABLE",
      detail: "Jane Doe showed: Message, Follow, More",
    });
    expect((await processConnectionJob(s.connJob())).reason).toBe("connect_unavailable");
    const lead = await Lead.findById(s.lead._id);
    expect(lead?.status).toBe("skipped");
    expect(lead?.skipReason).toBe("connect_unavailable: Jane Doe showed: Message, Follow, More");
    const [event] = await events("job_skipped");
    expect(event.payload).toMatchObject({ reason: "connect_unavailable", detail: "Jane Doe showed: Message, Follow, More" });
  });
});

describe("connectionProcessor proxy outage", () => {
  it("keeps the lead pending and frees the daily slot when the proxy is down", async () => {
    const s = await setup();
    sendConnectionRequest.mockResolvedValue({ success: false, error: "PROXY_FAILED" });
    // Even on the final attempt: an infrastructure failure must not burn the lead.
    await expect(processConnectionJob(s.connJob({ attempts: 2 }, 1))).rejects.toThrow("PROXY_FAILED");
    expect((await Lead.findById(s.lead._id))?.status).toBe("pending");
    expect((await LinkedInAccount.findById(s.account._id))?.todaySentCount).toBe(0);
    expect((await LinkedInAccount.findById(s.account._id))?.status).toBe("active");
  });
});

describe("messageProcessor", () => {
  async function connectedSetup(wsOverrides?: Record<string, unknown>, campaignOverrides?: Record<string, unknown>) {
    const s = await setup(wsOverrides, campaignOverrides);
    await Lead.updateOne({ _id: s.lead._id }, { status: "connected", connectedAt: new Date() });
    const msgJob = (step = 1, opts?: { attempts?: number }, attemptsMade?: number) =>
      job(
        {
          leadId: String(s.lead._id),
          campaignId: String(s.campaign._id),
          accountId: String(s.account._id),
          messageStep: step,
        },
        opts,
        attemptsMade,
      );
    return { ...s, msgJob };
  }

  it("sends step 1, updates lead + stats + conversation and queues step 2 with its delay", async () => {
    const s = await connectedSetup();
    expect(await processMessageJob(s.msgJob(1))).toEqual({ sent: true });
    expect(sendMessage).toHaveBeenCalledWith(expect.any(Array), s.lead.linkedinUrl, "Thanks First0!", expect.any(Object));

    const lead = await Lead.findById(s.lead._id);
    expect(lead?.status).toBe("msg1_sent");
    expect(lead?.msg1SentAt).toBeInstanceOf(Date);
    expect((await Campaign.findById(s.campaign._id))?.stats?.msg1Sent).toBe(1);
    expect(await events("msg1_sent")).toHaveLength(1);

    const convo = await Conversation.findOne({ leadId: s.lead._id });
    expect(convo?.messages).toHaveLength(1);
    expect(convo?.messages[0]).toMatchObject({ direction: "sent", body: "Thanks First0!" });
    expect(convo?.toObject()).toMatchObject({
      title: "First0 Last0",
      participantName: "First0 Last0",
      lastMessagePreview: "Thanks First0!",
      status: "open",
    });
    expect(String(convo?.campaignId)).toBe(String(s.campaign._id));

    const [, data, opts] = queues().messageQueue.add.mock.calls[0];
    expect((data as { messageStep: number }).messageStep).toBe(2);
    expect(opts?.delay).toBe(3 * DAY);
    expect(opts?.jobId).toBe(`msg-${s.lead._id}-2`);
  });

  it("step 2 appends to the same conversation and the sequence ends after the last step", async () => {
    const s = await connectedSetup();
    await processMessageJob(s.msgJob(1));
    queues().messageQueue.add.mockClear();
    await processMessageJob(s.msgJob(2));
    expect((await Lead.findById(s.lead._id))?.status).toBe("msg2_sent");
    expect(await Conversation.countDocuments()).toBe(1);
    expect((await Conversation.findOne({ leadId: s.lead._id }))?.messages).toHaveLength(2);
    expect(queues().messageQueue.add).not.toHaveBeenCalled();
  });

  it("does not send when the lead already replied or is at another step (dedupe guard)", async () => {
    const s = await connectedSetup();
    await Lead.updateOne({ _id: s.lead._id }, { status: "replied" });
    expect((await processMessageJob(s.msgJob(1))).reason).toBe("lead_status_replied");
    await Lead.updateOne({ _id: s.lead._id }, { status: "msg1_sent" });
    expect((await processMessageJob(s.msgJob(1))).skipped).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("defers to the next sending window instead of sending outside it", async () => {
    vi.setSystemTime(new Date("2026-10-21T21:00:00Z"));
    const s = await connectedSetup({ sendingWindowStart: 8, sendingWindowEnd: 20, sendOnWeekends: false, timezone: "UTC" });
    const res = await processMessageJob(s.msgJob(1));
    expect(res).toEqual({ deferred: true, delayMs: 11 * HOUR });
    expect(sendMessage).not.toHaveBeenCalled();
    const add = queues().messageQueue.add;
    expect(add).toHaveBeenCalledWith(
      "send-message",
      expect.objectContaining({ messageStep: 1 }),
      expect.objectContaining({ delay: expect.any(Number) }),
    );
    const opts = add.mock.calls[0][2];
    expect(opts?.delay).toBeGreaterThanOrEqual(11 * HOUR);
    expect(opts?.delay).toBeLessThanOrEqual(12 * HOUR);
    expect(opts?.jobId).toBeUndefined();
  });

  it("the campaign timezone decides whether a message may be sent now", async () => {
    // 16:00 UTC is 21:30 in Kolkata: open for the UTC workspace, closed for the Kolkata campaign.
    vi.setSystemTime(new Date("2026-10-21T16:00:00Z"));
    const office = { sendingWindowStart: 8, sendingWindowEnd: 20, sendOnWeekends: false, timezone: "UTC" };
    const s = await connectedSetup(office, { settings: { timezone: "Asia/Kolkata" } });
    expect(await processMessageJob(s.msgJob(1))).toEqual({ deferred: true, delayMs: 10.5 * HOUR });
    expect(sendMessage).not.toHaveBeenCalled();

    await Campaign.updateOne({ _id: s.campaign._id }, { $set: { "settings.timezone": null } });
    expect(await processMessageJob(s.msgJob(1))).toEqual({ sent: true });
  });

  it("session expiry triggers re-login + retry for messages too", async () => {
    const s = await connectedSetup();
    sendMessage.mockResolvedValueOnce({ success: false, error: "SESSION_EXPIRED" }).mockResolvedValueOnce({ success: true });
    expect(await processMessageJob(s.msgJob(1))).toEqual({ sent: true });
    expect(loginToLinkedIn).toHaveBeenCalledTimes(1);
  });

  it("transient failures retry, and the final attempt marks the lead skipped", async () => {
    const s = await connectedSetup();
    sendMessage
      .mockResolvedValueOnce({ success: false, error: "MESSAGE_UNAVAILABLE" })
      .mockResolvedValueOnce({ success: false, error: "MESSAGE_UNAVAILABLE" });
    await expect(processMessageJob(s.msgJob(1, { attempts: 2 }, 0))).rejects.toThrow("Message send failed");
    expect(await processMessageJob(s.msgJob(1, { attempts: 2 }, 1))).toMatchObject({ reason: "send_failed" });
    const lead = await Lead.findById(s.lead._id);
    expect(lead?.status).toBe("skipped");
    expect(lead?.skipReason).toBe("message_failed:MESSAGE_UNAVAILABLE");
  });

  it("skips unconfigured steps and paused campaigns", async () => {
    const s = await connectedSetup();
    expect((await processMessageJob(s.msgJob(3))).reason).toBe("step_not_configured");
    await Campaign.updateOne({ _id: s.campaign._id }, { status: "paused" });
    expect((await processMessageJob(s.msgJob(1))).reason).toBe("campaign_not_active");
  });
});
