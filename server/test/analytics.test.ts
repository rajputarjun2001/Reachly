import { describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, createAccount, createCampaign, createListWithLeads, createWorkspaceFixture, request } from "./factory";
import { AutomationEvent, Lead, type EventType } from "../models";
import * as analytics from "../domain/analytics";
import { DAY } from "../utils/schedule";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

async function seed() {
  const fx = await createWorkspaceFixture();
  const account = await createAccount(fx.workspace._id);
  const { list, leads } = await createListWithLeads(fx.workspace._id, 4);
  const campaign = await createCampaign(fx.workspace._id, account._id, list._id, {
    stats: { totalLeads: 4, connectionsSent: 4, connectionsAccepted: 2, msg1Sent: 2, replied: 1 },
  });
  const ev = (eventType: EventType, daysAgo: number) => ({
    workspaceId: fx.workspace._id,
    linkedinAccountId: account._id,
    campaignId: campaign._id,
    eventType,
    createdAt: new Date(Date.now() - daysAgo * DAY),
  });
  await AutomationEvent.insertMany([
    ev("connection_sent", 1),
    ev("connection_sent", 1),
    ev("connection_sent", 2),
    ev("connection_sent", 20),
    ev("connection_accepted", 1),
    ev("connection_accepted", 15),
    ev("reply_received", 0),
    ev("connection_sent", 60),
    ev("msg1_sent", 1),
    ev("msg_sent_manual", 3),
    ev("msg2_sent", 20),
    ev("msg3_sent", 60),
    ev("health_check", 1),
  ]);
  // Another workspace's events must never leak in.
  const other = await createWorkspaceFixture();
  await AutomationEvent.create({ workspaceId: other.workspace._id, eventType: "connection_sent" });

  // Leads for best-days: sent on a Monday and a Tuesday.
  const monday = new Date("2026-10-19T12:00:00Z");
  const tuesday = new Date("2026-10-20T12:00:00Z");
  await Lead.updateOne({ _id: leads[0]._id }, { status: "connected", connectionSentAt: monday, connectedAt: new Date() });
  await Lead.updateOne({ _id: leads[1]._id }, { status: "connection_sent", connectionSentAt: monday });
  await Lead.updateOne({ _id: leads[2]._id }, { status: "replied", connectionSentAt: tuesday, connectedAt: new Date() });
  await Lead.updateOne({ _id: leads[3]._id }, { status: "connection_sent", connectionSentAt: tuesday });
  return { ...fx, campaign, list, account };
}

describe("GET /api/analytics/overview", () => {
  it("aggregates by period and computes rates, including messages sent", async () => {
    const s = await seed();
    const week = await request(app).get("/api/analytics/overview?period=7d").set(s.auth);
    expect(week.status).toBe(200);
    expect(week.body.data).toMatchObject({
      period: "7d",
      connectionsSent: 3,
      connectionsAccepted: 1,
      acceptanceRate: 33.3,
      replied: 1,
      replyRate: 100,
      messagesSent: 2,
      activeCampaigns: 1,
      activeAccounts: 1,
    });
    const month = await request(app).get("/api/analytics/overview?period=30d").set(s.auth);
    expect(month.body.data).toMatchObject({ connectionsSent: 4, connectionsAccepted: 2, acceptanceRate: 50, messagesSent: 3 });
    const defaulted = await request(app).get("/api/analytics/overview").set(s.auth);
    expect(defaulted.body.data.period).toBe("30d");
    const all = await request(app).get("/api/analytics/overview?period=all").set(s.auth);
    expect(all.body.data.connectionsSent).toBe(5);
    expect(all.body.data.messagesSent).toBe(4);
    expect((await request(app).get("/api/analytics/overview?period=1y").set(s.auth)).status).toBe(400);
  });

  it("an empty workspace reports zeros without dividing by zero", async () => {
    const fx = await createWorkspaceFixture();
    expect(await analytics.overview(fx.ctx, "all")).toEqual({
      period: "all",
      connectionsSent: 0,
      connectionsAccepted: 0,
      acceptanceRate: 0,
      replied: 0,
      replyRate: 0,
      messagesSent: 0,
      activeCampaigns: 0,
      activeAccounts: 0,
    });
  });
});

describe("GET /api/analytics/daily", () => {
  it("returns one zero-filled row per day", async () => {
    const s = await seed();
    const res = await request(app).get("/api/analytics/daily?period=7d").set(s.auth);
    expect(res.body.data).toHaveLength(7);
    type Row = { date: string; connectionsSent: number; accepted: number; replied: number };
    const totals = (res.body.data as Row[]).reduce(
      (acc, d) => ({ sent: acc.sent + d.connectionsSent, accepted: acc.accepted + d.accepted, replied: acc.replied + d.replied }),
      { sent: 0, accepted: 0, replied: 0 },
    );
    expect(totals).toEqual({ sent: 3, accepted: 1, replied: 1 });
    expect(res.body.data[0]).toEqual(expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    expect(res.body.data.at(-1).date).toBe(new Date().toISOString().slice(0, 10));
    expect((await request(app).get("/api/analytics/daily?period=all").set(s.auth)).status).toBe(400);
  });
});

describe("GET /api/analytics/campaigns", () => {
  it("combines campaign stats with lead counts", async () => {
    const s = await seed();
    const res = await request(app).get("/api/analytics/campaigns").set(s.auth);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      campaignId: String(s.campaign._id),
      name: "Campaign",
      totalLeads: 4,
      connectionsSent: 4,
      connectionsAccepted: 2,
      acceptanceRate: 50,
      replyRate: 50,
      leadStatusCounts: { connected: 1, connection_sent: 2, replied: 1 },
    });
  });

  it("draft campaigns without a list report zero leads", async () => {
    const s = await seed();
    await createCampaign(s.workspace._id, null, null, { status: "draft", name: "Bare" });
    const rows = await analytics.campaignPerformance(s.ctx);
    expect(rows.find((r) => r.name === "Bare")).toMatchObject({ totalLeads: 0, leadStatusCounts: {}, acceptanceRate: 0 });
  });
});

describe("GET /api/analytics/best-days", () => {
  it("returns acceptance rate per weekday of the invitation", async () => {
    const s = await seed();
    const res = await request(app).get("/api/analytics/best-days").set(s.auth);
    expect(res.body.data).toHaveLength(7);
    type Day = { dayName: string; dayOfWeek: number; sent: number; accepted: number; acceptanceRate: number };
    const byName = Object.fromEntries((res.body.data as Day[]).map((d) => [d.dayName, d]));
    expect(byName.Monday).toMatchObject({ dayOfWeek: 2, sent: 2, accepted: 1, acceptanceRate: 50 });
    expect(byName.Tuesday).toMatchObject({ dayOfWeek: 3, sent: 2, accepted: 1, acceptanceRate: 50 });
    expect(byName.Sunday).toMatchObject({ sent: 0, acceptanceRate: 0 });
  });
});

describe("dashboard helpers", () => {
  it("workspaceCounts and createdPerDay are scoped to the workspace", async () => {
    const s = await seed();
    await createCampaign(s.workspace._id, null, null, { status: "draft", name: "Draft" });
    const other = await createWorkspaceFixture();
    await createListWithLeads(other.workspace._id, 5);

    expect(await analytics.workspaceCounts(s.ctx)).toEqual({
      totalLeads: 4,
      leadListCount: 1,
      campaignCount: 2,
      campaignsByStatus: { active: 1, draft: 1 },
    });

    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 2 * DAY);
    const leads = await analytics.createdPerDay(s.ctx, "leads", since);
    expect(leads.get(today)).toBe(4);
    const campaigns = await analytics.createdPerDay(s.ctx, "campaigns", since);
    expect(campaigns.get(today)).toBe(2);
    expect((await analytics.createdPerDay(s.ctx, "leads", new Date(Date.now() + DAY))).size).toBe(0);
  });

  it("rate rounds to one decimal and periodStart validates", () => {
    expect(analytics.rate(1, 3)).toBe(33.3);
    expect(analytics.rate(2, 3)).toBe(66.7);
    expect(analytics.rate(5, 0)).toBe(0);
    expect(analytics.periodStart("all")).toBeNull();
    expect(() => analytics.periodStart("all", false)).toThrow(/period must be one of/);
    const start = analytics.periodStart("7d");
    expect(start?.getUTCHours()).toBe(0);
    expect(Math.round((Date.now() - start!.getTime()) / DAY)).toBeGreaterThanOrEqual(6);
  });
});
