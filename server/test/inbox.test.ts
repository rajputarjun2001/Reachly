import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { createAccount, createCampaign, createListWithLeads, createWorkspaceFixture, job } from "./factory";
import { AutomationEvent, Campaign, Conversation, Lead, LinkedInAccount } from "../models";
import { getQueues } from "../services/scheduler/queues";
import * as li from "../services/playwright/linkedinActions";
import type { InboxConversation } from "../services/playwright/linkedinActions";
import { newMessages, processInboxJob } from "../services/scheduler/inboxProcessor";
import { checkAcceptances } from "../services/scheduler/acceptanceChecker";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

const queues = () => vi.mocked(getQueues(), true);
const scrapeInbox = vi.mocked(li.scrapeInbox);
const checkConnectionStatus = vi.mocked(li.checkConnectionStatus);
const loginToLinkedIn = vi.mocked(li.loginToLinkedIn);

beforeEach(() => {
  vi.clearAllMocks();
});

const thread = (c: Partial<InboxConversation> & { threadId: string }): InboxConversation => ({
  senderName: "",
  preview: "",
  timestamp: "10:00",
  unread: false,
  ...c,
});

const inbox = (...conversations: InboxConversation[]) => scrapeInbox.mockResolvedValueOnce({ success: true, conversations });

async function setup() {
  const fx = await createWorkspaceFixture({ sendingWindowStart: 0, sendingWindowEnd: 24, sendOnWeekends: true });
  const account = await createAccount(fx.workspace._id);
  const { list, leads } = await createListWithLeads(fx.workspace._id, 3);
  const campaign = await createCampaign(fx.workspace._id, account._id, list._id);
  await Lead.updateOne({ _id: leads[0]._id }, { status: "msg1_sent", msg1SentAt: new Date() });
  await Lead.updateOne({ _id: leads[1]._id }, { status: "connected" });
  return { ...fx, account, list, leads, campaign, inboxJob: job({ accountId: String(account._id) }) };
}

describe("inboxProcessor", () => {
  it("matches a reply by profile URL, stores it, marks the lead replied and logs one event", async () => {
    const s = await setup();
    const scraped = thread({
      threadId: "thread-1",
      senderName: "Someone Else",
      preview: "Sounds great",
      unread: true,
      profileUrl: `${s.leads[0].linkedinUrl}/`,
      messages: [
        { direction: "sent", body: "Thanks First0!" },
        { direction: "received", body: "Sounds great, let us talk" },
      ],
    });
    inbox(scraped);

    const summary = await processInboxJob(s.inboxJob);
    expect(summary).toMatchObject({ conversations: 1, replies: 1 });

    const convo = await Conversation.findOne({ linkedinThreadId: "thread-1" });
    expect(String(convo?.leadId)).toBe(String(s.leads[0]._id));
    expect(String(convo?.campaignId)).toBe(String(s.campaign._id));
    expect(convo?.hasUnread).toBe(true);
    expect(convo?.messages.map((m) => m.direction)).toEqual(["sent", "received"]);
    expect(convo?.lastMessagePreview).toBe("Sounds great, let us talk");
    expect(convo?.title).toBe("Someone Else");

    const lead = await Lead.findById(s.leads[0]._id);
    expect(lead?.status).toBe("replied");
    expect(lead?.repliedAt).toBeInstanceOf(Date);
    expect((await Campaign.findById(s.campaign._id))?.stats?.replied).toBe(1);
    expect(await AutomationEvent.countDocuments({ eventType: "reply_received" })).toBe(1);

    // Polling again with the same content adds nothing and logs no second reply.
    inbox(scraped);
    const again = await processInboxJob(s.inboxJob);
    expect(again).toMatchObject({ newMessages: 0, replies: 0 });
    expect((await Conversation.findOne({ linkedinThreadId: "thread-1" }))?.messages).toHaveLength(2);
    expect(await AutomationEvent.countDocuments({ eventType: "reply_received" })).toBe(1);
  });

  it("attaches the thread to the conversation created when we sent the campaign message", async () => {
    const s = await setup();
    await Conversation.create({
      workspaceId: s.workspace._id,
      linkedinAccountId: s.account._id,
      leadId: s.leads[0]._id,
      campaignId: s.campaign._id,
      title: "First0 Last0",
      messages: [{ direction: "sent", body: "Thanks First0!" }],
    });
    inbox(thread({ threadId: "t-2", senderName: "First0 Last0", preview: "Hey!", unread: true }));
    await processInboxJob(s.inboxJob);
    expect(await Conversation.countDocuments()).toBe(1);
    const convo = await Conversation.findOne({});
    expect(convo?.linkedinThreadId).toBe("t-2");
    expect(convo?.title).toBe("First0 Last0");
    expect(convo?.messages.map((m) => m.body)).toEqual(["Thanks First0!", "Hey!"]);
  });

  it("ignores threads that do not belong to any campaign lead, and our own previews", async () => {
    const s = await setup();
    inbox(
      thread({ threadId: "personal", senderName: "Mom", preview: "Call me", unread: true }),
      thread({ threadId: "own", senderName: "First1 Last1", preview: "You: following up", unread: false }),
      thread({ threadId: "", senderName: "First1 Last1", preview: "no id", unread: true }),
    );
    const summary = await processInboxJob(s.inboxJob);
    expect(await Conversation.findOne({ linkedinThreadId: "personal" })).toBeNull();
    const own = await Conversation.findOne({ linkedinThreadId: "own" });
    expect(own?.messages[0]).toMatchObject({ direction: "sent", body: "following up" });
    expect(own?.hasUnread).toBe(false);
    expect(summary).toMatchObject({ conversations: 1, replies: 0 });
    expect((await Lead.findById(s.leads[1]._id))?.status).toBe("connected");
  });

  it("does not match by name when it is ambiguous", async () => {
    const s = await setup();
    await Lead.updateOne({ _id: s.leads[2]._id }, { status: "connected", firstName: "First1", lastName: "Last1" });
    inbox(thread({ threadId: "dupe", senderName: "First1 Last1", preview: "hello", unread: true }));
    expect(await processInboxJob(s.inboxJob)).toMatchObject({ conversations: 0 });
    expect(await Conversation.countDocuments()).toBe(0);
  });

  it("a new reply re-opens an archived conversation", async () => {
    const s = await setup();
    await Conversation.create({
      workspaceId: s.workspace._id,
      linkedinAccountId: s.account._id,
      leadId: s.leads[0]._id,
      linkedinThreadId: "arch",
      status: "archived",
      messages: [{ direction: "sent", body: "Thanks First0!" }],
    });
    inbox(thread({ threadId: "arch", senderName: "First0 Last0", preview: "Back again", unread: true }));
    await processInboxJob(s.inboxJob);
    const convo = await Conversation.findOne({ linkedinThreadId: "arch" });
    expect(convo?.status).toBe("open");
    expect(convo?.hasUnread).toBe(true);
  });

  it("checks pending invitations and queues the first message for accepted ones", async () => {
    const s = await setup();
    await Lead.updateOne({ _id: s.leads[2]._id }, { status: "connection_sent", connectionSentAt: new Date() });
    checkConnectionStatus.mockResolvedValueOnce({ success: true, results: { [s.leads[2].linkedinUrl]: "connected" } });
    const summary = await processInboxJob(s.inboxJob);
    expect(summary).toHaveProperty("acceptance");
    expect((summary as { acceptance: unknown }).acceptance).toMatchObject({ checked: 1, accepted: 1 });
    const lead = await Lead.findById(s.leads[2]._id);
    expect(lead?.status).toBe("connected");
    expect(lead?.connectedAt).toBeInstanceOf(Date);
    expect((await Campaign.findById(s.campaign._id))?.stats?.connectionsAccepted).toBe(1);
    expect(await AutomationEvent.countDocuments({ eventType: "connection_accepted" })).toBe(1);
    expect(queues().messageQueue.add).toHaveBeenCalledWith(
      "send-message",
      expect.objectContaining({ messageStep: 1 }),
      expect.any(Object),
    );
  });

  it("acceptance checks mark withdrawn invitations skipped and stamp pending ones", async () => {
    const s = await setup();
    await Lead.updateMany({ _id: { $in: [s.leads[1]._id, s.leads[2]._id] } }, { status: "connection_sent", connectionSentAt: new Date() });
    checkConnectionStatus.mockResolvedValueOnce({
      success: true,
      results: { [s.leads[1].linkedinUrl]: "not_connected", [s.leads[2].linkedinUrl]: "pending" },
    });
    const account = await LinkedInAccount.findById(s.account._id).select("+sessionCookies +linkedinPasswordEncrypted");
    expect(await checkAcceptances(account!)).toMatchObject({ checked: 2, accepted: 0 });
    const withdrawn = await Lead.findById(s.leads[1]._id);
    expect(withdrawn?.status).toBe("skipped");
    expect(withdrawn?.skipReason).toBe("invitation_withdrawn");
    const pending = await Lead.findById(s.leads[2]._id);
    expect(pending?.status).toBe("connection_sent");
    expect(pending?.lastAcceptanceCheckAt).toBeInstanceOf(Date);

    await Campaign.updateOne({ _id: s.campaign._id }, { status: "paused" });
    expect(await checkAcceptances(account!)).toEqual({ checked: 0, accepted: 0 });
  });

  it("cookie expiry during polling re-logs in; failure flags the account", async () => {
    const s = await setup();
    scrapeInbox
      .mockResolvedValueOnce({ success: false, error: "SESSION_EXPIRED" })
      .mockResolvedValueOnce({ success: true, conversations: [] });
    await processInboxJob(s.inboxJob);
    expect(loginToLinkedIn).toHaveBeenCalledTimes(1);

    scrapeInbox.mockResolvedValueOnce({ success: false, error: "SESSION_EXPIRED" });
    loginToLinkedIn.mockRejectedValueOnce(new Error("INVALID_CREDENTIALS"));
    const res = await processInboxJob(s.inboxJob);
    expect(res).toMatchObject({ skipped: true, reason: "account_flagged" });
    const account = await LinkedInAccount.findById(s.account._id);
    expect(account?.status).toBe("flagged");
    expect(account?.flagReason).toBe("relogin_failed");
  });

  it("other scrape failures throw so BullMQ retries", async () => {
    const s = await setup();
    scrapeInbox.mockResolvedValueOnce({ success: false, error: "net::ERR_TIMED_OUT" });
    await expect(processInboxJob(s.inboxJob)).rejects.toThrow("Inbox scrape failed: net::ERR_TIMED_OUT");
  });

  it("skips inactive accounts", async () => {
    const s = await setup();
    await LinkedInAccount.updateOne({ _id: s.account._id }, { status: "disconnected" });
    expect(await processInboxJob(s.inboxJob)).toMatchObject({ skipped: true });
    expect(scrapeInbox).not.toHaveBeenCalled();
  });
});

describe("newMessages", () => {
  it("dedupes by direction + body and falls back to the preview", () => {
    const convo = { messages: [{ direction: "received", body: "hi" }] };
    expect(newMessages({ preview: "hi" }, convo)).toEqual([]);
    expect(newMessages({ preview: "new one" }, convo)).toEqual([{ direction: "received", body: "new one" }]);
    expect(newMessages({ preview: "You: ok" }, convo)).toEqual([{ direction: "sent", body: "ok" }]);
    expect(newMessages({ preview: "" }, null)).toEqual([]);
    expect(
      newMessages(
        {
          preview: "ignored",
          messages: [
            { direction: "received", body: "hi" },
            { direction: "sent", body: "hi" },
          ],
        },
        convo,
      ),
    ).toEqual([{ direction: "sent", body: "hi" }]);
  });
});
