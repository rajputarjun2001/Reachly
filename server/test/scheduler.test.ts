import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { createAccount, createCampaign, createListWithLeads, createWorkspaceFixture, job } from "./factory";
import { Campaign, Lead, LinkedInAccount } from "../models";
import { getQueues } from "../services/scheduler/queues";
import {
  checkCampaignCompletion,
  expireStaleInvitations,
  runCampaignDay,
  scheduleDailyConnections,
  scheduleDueMessages,
  startAllActiveCampaigns,
} from "../services/scheduler/dailyScheduler";
import { processMaintenanceJob, registerRepeatableJobs } from "../services/scheduler/maintenanceProcessor";
import { nextMessageDueAt, scheduleNextMessage } from "../services/scheduler/sequence";
import { effectiveDailyLimit, reserveDailySlot, sendingWindowFor, sentToday } from "../services/scheduler/limits";
import { DAY, HOUR } from "../utils/schedule";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

const queues = () => vi.mocked(getQueues(), true);

beforeEach(() => {
  vi.clearAllMocks();
});

const OPEN = { sendingWindowStart: 0, sendingWindowEnd: 24, sendOnWeekends: true, timezone: "UTC" };
const OFFICE = { sendingWindowStart: 8, sendingWindowEnd: 20, sendOnWeekends: false, timezone: "UTC" };
// 2026-10-21 is a Wednesday.
const wednesday10am = new Date("2026-10-21T10:00:00Z");
const saturday10am = new Date("2026-10-24T10:00:00Z");

async function setup(wsOverrides: Record<string, unknown> = OPEN, leadCount = 15, campaignOverrides: Record<string, unknown> = {}) {
  const fx = await createWorkspaceFixture(wsOverrides);
  const account = await createAccount(fx.workspace._id);
  const { list, leads } = await createListWithLeads(fx.workspace._id, leadCount);
  const campaign = await createCampaign(fx.workspace._id, account._id, list._id, campaignOverrides);
  return { ...fx, account, list, leads, campaign };
}

/** Lets the same campaign be scheduled again "today" (simulates a fresh day for the counter tests). */
async function forgetSchedule(campaign: Awaited<ReturnType<typeof setup>>["campaign"]) {
  campaign.lastScheduledFor = undefined;
  await Campaign.updateOne({ _id: campaign._id }, { $unset: { lastScheduledFor: 1 } });
}

describe("scheduleDailyConnections", () => {
  it("queues at most the daily limit, minus what was already sent today", async () => {
    const s = await setup();
    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(10);
    vi.clearAllMocks();
    await forgetSchedule(s.campaign);
    await LinkedInAccount.updateOne({ _id: s.account._id }, { todaySentCount: 7, todayCountDate: "20261021" });
    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(3);
    expect(queues().connectionQueue.add).toHaveBeenCalledTimes(3);
  });

  it("a counter from a previous day does not reduce today's allowance", async () => {
    const s = await setup();
    await LinkedInAccount.updateOne({ _id: s.account._id }, { todaySentCount: 10, todayCountDate: "20261020" });
    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(10);
  });

  it("the workspace limit caps a higher per-account limit", async () => {
    const s = await setup({ ...OPEN, dailyLimitPerAccount: 4 });
    await LinkedInAccount.updateOne({ _id: s.account._id }, { dailyLimit: 10 });
    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(4);
  });

  it("the campaign dailyLimit setting is an extra cap", async () => {
    const s = await setup(OPEN, 15, { settings: { dailyLimit: 6 } });
    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(6);
  });

  it("respects weekends, closed windows and inactive accounts", async () => {
    const s = await setup(OFFICE);
    expect(await scheduleDailyConnections(s.campaign, saturday10am)).toBe(0);
    expect(await scheduleDailyConnections(s.campaign, new Date("2026-10-21T21:00:00Z"))).toBe(0);
    expect((await Campaign.findById(s.campaign._id))?.lastScheduledFor).toBeUndefined();

    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(10);
    for (const [, , opts] of queues().connectionQueue.add.mock.calls) {
      expect(opts?.delay).toBeGreaterThanOrEqual(0);
      expect(opts?.delay).toBeLessThan(10 * HOUR);
    }
    await forgetSchedule(s.campaign);
    await LinkedInAccount.updateOne({ _id: s.account._id }, { status: "flagged" });
    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(0);
  });

  it("runs at most once per campaign per local day and uses conn-<leadId>-<YYYYMMDD> job ids", async () => {
    const s = await setup(OPEN, 3);
    expect(await scheduleDailyConnections(s.campaign, wednesday10am)).toBe(3);
    const ids = queues().connectionQueue.add.mock.calls.map(([, , opts]) => opts?.jobId);
    expect(ids.sort()).toEqual(s.leads.map((l) => `conn-${l._id}-20261021`).sort());
    expect((await Campaign.findById(s.campaign._id))?.lastScheduledFor).toBe("20261021");

    vi.clearAllMocks();
    const fresh = await Campaign.findById(s.campaign._id);
    expect(await scheduleDailyConnections(fresh!, new Date("2026-10-21T15:00:00Z"))).toBe(0);
    expect(queues().connectionQueue.add).not.toHaveBeenCalled();

    expect(await scheduleDailyConnections(fresh!, new Date("2026-10-22T09:00:00Z"))).toBe(3);
    expect(queues().connectionQueue.add.mock.calls[0][2]?.jobId).toMatch(/-20261022$/);
  });

  it("evaluates the window and day key in a non-UTC timezone (Asia/Kolkata)", async () => {
    const s = await setup({ ...OFFICE, timezone: "Asia/Kolkata" }, 2);
    // 16:00 UTC = 21:30 IST: already closed in Kolkata even though UTC office hours are open.
    expect(await scheduleDailyConnections(s.campaign, new Date("2026-10-21T16:00:00Z"))).toBe(0);
    // 20:00 UTC = 01:30 IST on Thursday: the Kolkata window for the 22nd is ahead.
    expect(await scheduleDailyConnections(s.campaign, new Date("2026-10-21T20:00:00Z"))).toBe(2);
    for (const [, , opts] of queues().connectionQueue.add.mock.calls) {
      expect(opts?.jobId).toMatch(/-20261022$/);
      expect(opts?.delay).toBeGreaterThanOrEqual(6.5 * HOUR);
      expect(opts?.delay).toBeLessThan(18.5 * HOUR);
    }
  });

  it("the campaign timezone overrides the workspace timezone", async () => {
    const s = await setup(OFFICE, 2, { settings: { timezone: "Asia/Kolkata" } });
    expect(await scheduleDailyConnections(s.campaign, new Date("2026-10-21T16:00:00Z"))).toBe(0);
    const utcCampaign = await createCampaign(s.workspace._id, s.account._id, s.list._id);
    expect(await scheduleDailyConnections(utcCampaign, new Date("2026-10-21T16:00:00Z"))).toBe(2);
  });

  it("only pending leads are scheduled", async () => {
    const s = await setup(OPEN, 3);
    await Lead.updateOne({ _id: s.leads[0]._id }, { status: "connection_sent" });
    await scheduleDailyConnections(s.campaign, wednesday10am);
    const ids = queues().connectionQueue.add.mock.calls.map(([, d]) => (d as { leadId: string }).leadId);
    expect(ids).not.toContain(String(s.leads[0]._id));
    expect(ids).toHaveLength(2);
  });

  it("returns 0 for drafts without an account or list", async () => {
    const s = await setup(OPEN, 1);
    const draft = await createCampaign(s.workspace._id, null, s.list._id, { status: "draft" });
    expect(await scheduleDailyConnections(draft, wednesday10am)).toBe(0);
  });
});

describe("daily limits", () => {
  it("effectiveDailyLimit, sentToday and sendingWindowFor", () => {
    expect(effectiveDailyLimit({ dailyLimit: 25 }, { dailyLimitPerAccount: 50 })).toBe(25);
    expect(effectiveDailyLimit({ dailyLimit: 25 }, { dailyLimitPerAccount: 5 })).toBe(5);
    expect(effectiveDailyLimit({}, null)).toBe(10);

    expect(sentToday({ todaySentCount: 4, todayCountDate: "20261021" }, { timezone: "UTC" }, wednesday10am)).toBe(4);
    expect(sentToday({ todaySentCount: 4, todayCountDate: "20261020" }, { timezone: "UTC" }, wednesday10am)).toBe(0);
    // 20:00 UTC on the 21st is already the 22nd in Kolkata.
    const late = new Date("2026-10-21T20:00:00Z");
    expect(sentToday({ todaySentCount: 4, todayCountDate: "20261021" }, { timezone: "Asia/Kolkata" }, late)).toBe(0);

    expect(sendingWindowFor(null)).toEqual({ sendingWindowStart: 8, sendingWindowEnd: 20, sendOnWeekends: false, timezone: "UTC" });
    expect(sendingWindowFor({ timezone: "Europe/Berlin" }, { settings: { timezone: "Asia/Kolkata" } }).timezone).toBe("Asia/Kolkata");
    expect(sendingWindowFor({ timezone: "Europe/Berlin" }, { settings: { timezone: null } }).timezone).toBe("Europe/Berlin");
  });

  it("reserveDailySlot enforces the limit atomically", async () => {
    const s = await setup(OPEN, 0);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => reserveDailySlot(s.account._id, 3, { timezone: "UTC" }, wednesday10am)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    const acc = await LinkedInAccount.findById(s.account._id);
    expect(acc?.todaySentCount).toBe(3);
    expect(acc?.todayCountDate).toBe("20261021");
    expect(await reserveDailySlot(s.account._id, 3, { timezone: "UTC" }, wednesday10am)).toBeNull();
  });

  it("a stale todayCountDate resets the counter before reserving", async () => {
    const s = await setup(OPEN, 0);
    await LinkedInAccount.updateOne({ _id: s.account._id }, { todaySentCount: 10, todayCountDate: "20261020" });
    const release = await reserveDailySlot(s.account._id, 10, { timezone: "UTC" }, wednesday10am);
    expect(release).toBeTypeOf("function");
    const acc = await LinkedInAccount.findById(s.account._id);
    expect(acc?.todaySentCount).toBe(1);
    expect(acc?.todayCountDate).toBe("20261021");
  });

  it("the day boundary follows the workspace timezone", async () => {
    const s = await setup(OPEN, 0);
    await LinkedInAccount.updateOne({ _id: s.account._id }, { todaySentCount: 10, todayCountDate: "20261021" });
    const late = new Date("2026-10-21T20:00:00Z");
    expect(await reserveDailySlot(s.account._id, 10, { timezone: "UTC" }, late)).toBeNull();
    expect(await reserveDailySlot(s.account._id, 10, { timezone: "Asia/Kolkata" }, late)).not.toBeNull();
    expect((await LinkedInAccount.findById(s.account._id))?.todayCountDate).toBe("20261022");
  });

  it("releasing a slot gives it back (e.g. after a failed send)", async () => {
    const s = await setup(OPEN, 0);
    const release = await reserveDailySlot(s.account._id, 1, { timezone: "UTC" }, wednesday10am);
    expect(release).not.toBeNull();
    expect(await reserveDailySlot(s.account._id, 1, { timezone: "UTC" }, wednesday10am)).toBeNull();
    await release!();
    expect((await LinkedInAccount.findById(s.account._id))?.todaySentCount).toBe(0);
    expect(await reserveDailySlot(s.account._id, 1, { timezone: "UTC" }, wednesday10am)).not.toBeNull();
  });
});

describe("message sequencing", () => {
  it("nextMessageDueAt follows the step chain and delays", () => {
    const campaign = {
      _id: "c1",
      messages: [
        { step: 1, delayDays: 1, body: "a" },
        { step: 2, delayDays: 3, body: "b" },
      ],
    };
    const base = new Date("2026-10-01T10:00:00Z");
    expect(nextMessageDueAt(campaign, { _id: "l", status: "connected", connectedAt: base })).toEqual({
      stepNumber: 1,
      dueAt: new Date(base.getTime() + DAY),
    });
    expect(nextMessageDueAt(campaign, { _id: "l", status: "msg1_sent", msg1SentAt: base })).toEqual({
      stepNumber: 2,
      dueAt: new Date(base.getTime() + 3 * DAY),
    });
    expect(nextMessageDueAt(campaign, { _id: "l", status: "msg2_sent", msg2SentAt: base })).toBeNull();
    expect(nextMessageDueAt(campaign, { _id: "l", status: "replied" })).toBeNull();
    expect(nextMessageDueAt(campaign, { _id: "l", status: "connected" })).toBeNull();
  });

  it("scheduleDueMessages queues only messages due within the next 24 hours", async () => {
    const s = await setup(OPEN, 4);
    const now = wednesday10am;
    const ago = (ms: number) => new Date(now.getTime() - ms);
    await Lead.updateOne({ _id: s.leads[0]._id }, { status: "connected", connectedAt: ago(2 * DAY) });
    await Lead.updateOne({ _id: s.leads[1]._id }, { status: "msg1_sent", msg1SentAt: now });
    await Lead.updateOne({ _id: s.leads[2]._id }, { status: "msg1_sent", msg1SentAt: ago(3 * DAY) });
    await Lead.updateOne({ _id: s.leads[3]._id }, { status: "connected", connectedAt: ago(12 * HOUR) });
    expect(await scheduleDueMessages(s.campaign, now)).toBe(3);
    const calls = queues().messageQueue.add.mock.calls.map(([, d, o]) => ({
      lead: (d as { leadId: string }).leadId,
      step: (d as { messageStep: number }).messageStep,
      delay: o?.delay,
    }));
    expect(calls).toEqual(
      expect.arrayContaining([
        { lead: String(s.leads[0]._id), step: 1, delay: 0 },
        { lead: String(s.leads[2]._id), step: 2, delay: 0 },
        { lead: String(s.leads[3]._id), step: 1, delay: 12 * HOUR },
      ]),
    );
  });

  it("repeated hourly runs reuse a stable job id per lead and step so BullMQ dedupes them", async () => {
    const s = await setup(OPEN, 1);
    await Lead.updateOne({ _id: s.leads[0]._id }, { status: "connected", connectedAt: new Date(wednesday10am.getTime() - 12 * HOUR) });
    await scheduleDueMessages(s.campaign, wednesday10am);
    await scheduleDueMessages(s.campaign, new Date(wednesday10am.getTime() + HOUR));
    const ids = queues().messageQueue.add.mock.calls.map(([, , o]) => o?.jobId);
    expect(ids).toEqual([`msg-${s.leads[0]._id}-1`, `msg-${s.leads[0]._id}-1`]);

    const lead = await Lead.findById(s.leads[0]._id);
    vi.clearAllMocks();
    expect(await scheduleNextMessage(s.campaign, lead!, wednesday10am)).toBe(true);
    expect(queues().messageQueue.add.mock.calls[0][2]?.jobId).toBe(`msg-${s.leads[0]._id}-1`);
  });
});

describe("campaign lifecycle helpers", () => {
  it("expires invitations older than 30 days", async () => {
    const s = await setup(OPEN, 2);
    await Lead.updateOne(
      { _id: s.leads[0]._id },
      { status: "connection_sent", connectionSentAt: new Date(Date.now() - 31 * DAY) },
    );
    await Lead.updateOne({ _id: s.leads[1]._id }, { status: "connection_sent", connectionSentAt: new Date() });
    expect(await expireStaleInvitations(s.campaign)).toBe(1);
    const expired = await Lead.findById(s.leads[0]._id);
    expect(expired?.status).toBe("skipped");
    expect(expired?.skipReason).toBe("connection_not_accepted");
    expect((await Lead.findById(s.leads[1]._id))?.status).toBe("connection_sent");
  });

  it("completes when every lead has finished the sequence", async () => {
    const s = await setup(OPEN, 3);
    await Lead.updateOne({ _id: s.leads[0]._id }, { status: "msg2_sent" });
    await Lead.updateOne({ _id: s.leads[1]._id }, { status: "replied" });
    await Lead.updateOne({ _id: s.leads[2]._id }, { status: "msg1_sent" });
    expect(await checkCampaignCompletion(s.campaign)).toBe(false);
    await Lead.updateOne({ _id: s.leads[2]._id }, { status: "skipped" });
    expect(await checkCampaignCompletion(s.campaign)).toBe(true);
    const c = await Campaign.findById(s.campaign._id);
    expect(c?.status).toBe("completed");
    expect(c?.completedAt).toBeInstanceOf(Date);
  });

  it("a campaign without messages is complete once everyone is connected", async () => {
    const s = await setup(OPEN, 1);
    s.campaign.set("messages", []);
    await s.campaign.save();
    await Lead.updateOne({ _id: s.leads[0]._id }, { status: "connected" });
    expect(await checkCampaignCompletion(s.campaign)).toBe(true);
  });

  it("runCampaignDay reports completion instead of scheduling", async () => {
    const s = await setup(OPEN, 1);
    await Lead.updateOne({ _id: s.leads[0]._id }, { status: "replied" });
    expect(await runCampaignDay(s.campaign, wednesday10am)).toMatchObject({ completed: true });
    expect(queues().connectionQueue.add).not.toHaveBeenCalled();
  });

  it("startAllActiveCampaigns schedules active campaigns, ensures inbox polls and is idempotent per day", async () => {
    const s = await setup(OPEN, 2);
    await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "paused" });
    const summary = await startAllActiveCampaigns(wednesday10am);
    expect(summary.campaigns).toHaveLength(1);
    expect(summary.campaigns[0].connections).toBe(2);
    expect(summary.inboxPolls).toBe(1);
    expect(queues().inboxPollQueue.upsertJobScheduler).toHaveBeenCalledTimes(1);

    const hourLater = await startAllActiveCampaigns(new Date(wednesday10am.getTime() + HOUR));
    expect(hourLater.campaigns[0].connections).toBe(0);
    expect(queues().connectionQueue.add).toHaveBeenCalledTimes(2);
  });

  it("startAllActiveCampaigns isolates per-campaign failures", async () => {
    const s = await setup(OPEN, 2);
    queues().connectionQueue.add.mockRejectedValueOnce(new Error("redis down"));
    const summary = await startAllActiveCampaigns(wednesday10am);
    expect(summary.campaigns[0]).toMatchObject({ error: "redis down" });
    expect(summary.inboxPolls).toBe(1);
    expect((await Campaign.findById(s.campaign._id))?.lastScheduledFor).toBeUndefined();
  });
});

describe("maintenance jobs", () => {
  it("registers an hourly schedule and the 30-min health check, and removes the legacy reset job", async () => {
    await registerRepeatableJobs();
    const q = queues().maintenanceQueue;
    expect(q.upsertJobScheduler.mock.calls).toEqual(
      expect.arrayContaining([
        ["daily-schedule", { pattern: "5 * * * *", tz: "UTC" }, { name: "daily-schedule" }],
        ["health-check", { every: 30 * 60 * 1000 }, { name: "health-check" }],
      ]),
    );
    expect(q.upsertJobScheduler.mock.calls.map(([id]) => id)).not.toContain("reset-daily-counts");
    expect(q.removeJobScheduler).toHaveBeenCalledWith("reset-daily-counts");
  });

  it("tolerates the legacy reset job already being gone", async () => {
    queues().maintenanceQueue.removeJobScheduler.mockRejectedValueOnce(new Error("missing"));
    await expect(registerRepeatableJobs()).resolves.toBeUndefined();
  });

  it("daily-schedule runs the campaign scheduler; reset-daily-counts no longer exists", async () => {
    await setup(OPEN, 1);
    const result = (await processMaintenanceJob(job({}, {}, 0, "daily-schedule"))) as { campaigns: unknown[] };
    expect(result.campaigns).toHaveLength(1);
    await expect(processMaintenanceJob(job({}, {}, 0, "reset-daily-counts"))).rejects.toThrow("Unknown maintenance job");
  });

  it("unknown maintenance jobs fail loudly", async () => {
    await expect(processMaintenanceJob(job({}, {}, 0, "mystery"))).rejects.toThrow("Unknown maintenance job");
  });
});
