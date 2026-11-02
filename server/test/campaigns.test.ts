import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import {
  app,
  createAccount,
  createCampaign,
  createListWithLeads,
  createWorkspaceFixture,
  request,
} from "./factory";
import { Campaign, Lead } from "../models";
import { getQueues } from "../services/scheduler/queues";
import * as campaignsDomain from "../domain/campaigns";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

// A 0-24h window with weekends enabled makes scheduling independent of when the tests run.
const ALWAYS_OPEN = { sendingWindowStart: 0, sendingWindowEnd: 24, sendOnWeekends: true, timezone: "UTC" };
const queues = () => vi.mocked(getQueues(), true);

beforeEach(() => {
  vi.clearAllMocks();
});

async function setup(wsOverrides: Record<string, unknown> = ALWAYS_OPEN) {
  const fx = await createWorkspaceFixture(wsOverrides);
  const account = await createAccount(fx.workspace._id);
  const { list, leads } = await createListWithLeads(fx.workspace._id, 4);
  return { ...fx, account, list, leads };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const draftBody = (s: Setup, extra: Record<string, unknown> = {}) => ({
  name: "Q4 outreach",
  linkedinAccountId: String(s.account._id),
  leadListId: String(s.list._id),
  connectionNote: "Hi {{firstName}}",
  messages: [{ step: 1, delayDays: 2, body: "Thanks for connecting" }],
  ...extra,
});

describe("campaign CRUD", () => {
  it("creates a draft and validates input", async () => {
    const s = await setup();
    const res = await request(app).post("/api/campaigns").set(s.auth).send(draftBody(s));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "draft", name: "Q4 outreach" });

    const bad: Record<string, unknown>[] = [
      { name: "" },
      { connectionNote: "x".repeat(281) },
      { messages: [{ step: 2, delayDays: 1, body: "gap" }] },
      { messages: [{ step: 1, delayDays: -1, body: "neg" }] },
      { messages: [1, 2, 3, 4].map((step) => ({ step, delayDays: 1, body: "b" })) },
      { leadListId: "nope" },
      { settings: { timezone: "Mars/Olympus" } },
      { settings: { dailyLimit: 0 } },
      { settings: { dailyLimit: 101 } },
    ];
    for (const extra of bad) {
      const r = await request(app).post("/api/campaigns").set(s.auth).send(draftBody(s, extra));
      expect(r.status, JSON.stringify(extra)).toBe(400);
    }
  });

  it("REST create requires account and list, while the domain allows bare drafts", async () => {
    const s = await setup();
    const noAccount = await request(app).post("/api/campaigns").set(s.auth).send(draftBody(s, { linkedinAccountId: undefined }));
    expect(noAccount.status).toBe(400);
    expect(noAccount.body.error).toMatch(/linkedinAccountId/);
    const noList = await request(app).post("/api/campaigns").set(s.auth).send(draftBody(s, { leadListId: undefined }));
    expect(noList.status).toBe(400);
    expect(noList.body.error).toMatch(/leadListId/);

    const draft = await campaignsDomain.createCampaign(s.ctx, {
      name: "  Bare ",
      description: " About ",
      connectionLabel: "Intro",
      messages: [{ step: 1, delayDays: 1, body: " hi ", label: " First " }],
      settings: { goal: "demos", timezone: "Asia/Kolkata", dailyLimit: 5 },
    });
    expect(draft.toObject()).toMatchObject({
      name: "Bare",
      description: "About",
      status: "draft",
      linkedinAccountId: null,
      leadListId: null,
      connectionLabel: "Intro",
      settings: { goal: "demos", timezone: "Asia/Kolkata", dailyLimit: 5 },
    });
    expect(draft.messages[0]).toMatchObject({ body: "hi", label: "First" });

    await expect(campaignsDomain.launchCampaign(s.ctx, String(draft._id))).rejects.toMatchObject({ status: 422 });
    draft.set("linkedinAccountId", s.account._id);
    await draft.save();
    await expect(campaignsDomain.launchCampaign(s.ctx, String(draft._id))).rejects.toThrow(/lead list/);
  });

  it("rejects references to another workspace's account or list", async () => {
    const s = await setup();
    const other = await setup();
    const r1 = await request(app)
      .post("/api/campaigns")
      .set(s.auth)
      .send(draftBody(s, { linkedinAccountId: String(other.account._id) }));
    expect(r1.status).toBe(404);
    const r2 = await request(app)
      .post("/api/campaigns")
      .set(s.auth)
      .send(draftBody(s, { leadListId: String(other.list._id) }));
    expect(r2.status).toBe(404);
  });

  it("lists, shows detail with lead status counts, updates and deletes", async () => {
    const s = await setup();
    const created = (await request(app).post("/api/campaigns").set(s.auth).send(draftBody(s))).body.data;

    const list = await request(app).get("/api/campaigns").set(s.auth);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].leadListId.name).toBe("List");

    const detail = await request(app).get(`/api/campaigns/${created._id}`).set(s.auth);
    expect(detail.body.data.leadStatusCounts).toEqual({ pending: 4 });

    const upd = await request(app)
      .patch(`/api/campaigns/${created._id}`)
      .set(s.auth)
      .send({ name: "Renamed", connectionNote: "Yo", settings: { dailyLimit: 7 } });
    expect(upd.body.data).toMatchObject({ name: "Renamed", connectionNote: "Yo", settings: { dailyLimit: 7 } });

    expect((await request(app).delete(`/api/campaigns/${created._id}`).set(s.auth)).status).toBe(200);
    expect(await Campaign.countDocuments()).toBe(0);
  });

  it("filters the list by status and search", async () => {
    const s = await setup();
    await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "draft", name: "Alpha draft" });
    await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "paused", name: "Beta (EU)" });
    const drafts = await request(app).get("/api/campaigns?status=draft").set(s.auth);
    expect(drafts.body.data.map((c: { name: string }) => c.name)).toEqual(["Alpha draft"]);
    expect((await campaignsDomain.listCampaigns(s.ctx, { search: "(eu)" })).map((c) => c.name)).toEqual(["Beta (EU)"]);
    expect(await campaignsDomain.listCampaigns(s.ctx, { status: ["draft", "paused"] })).toHaveLength(2);
  });

  it("other workspaces cannot read campaigns", async () => {
    const s = await setup();
    const other = await setup();
    const c = await createCampaign(s.workspace._id, s.account._id, s.list._id);
    expect((await request(app).get(`/api/campaigns/${c._id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).post(`/api/campaigns/${c._id}/cancel`).set(other.auth)).status).toBe(404);
  });

  it("finished campaigns are locked; refs can only change while a draft", async () => {
    const s = await setup();
    const { list: list2 } = await createListWithLeads(s.workspace._id, 1);
    const draft = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "draft" });
    const moved = await campaignsDomain.updateCampaign(s.ctx, String(draft._id), { leadListId: String(list2._id) });
    expect(String(moved.leadListId)).toBe(String(list2._id));

    for (const status of ["completed", "cancelled", "archived", "failed"]) {
      const c = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status });
      const res = await request(app).patch(`/api/campaigns/${c._id}`).set(s.auth).send({ name: "x" });
      expect(res.status, status).toBe(409);
    }
  });
});

describe("launch / pause / resume", () => {
  it("launch activates the campaign and queues one connection job per lead up to the daily limit", async () => {
    const s = await setup();
    s.account.dailyLimit = 3;
    await s.account.save();
    const draft = (await request(app).post("/api/campaigns").set(s.auth).send(draftBody(s))).body.data;

    const res = await request(app).post(`/api/campaigns/${draft._id}/launch`).set(s.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.campaign.status).toBe("active");
    expect(res.body.data.campaign.stats.totalLeads).toBe(4);
    expect(res.body.data.scheduled.connections).toBe(3);

    const add = queues().connectionQueue.add;
    expect(add).toHaveBeenCalledTimes(3);
    const [name, data, opts] = add.mock.calls[0];
    expect(name).toBe("send-connection");
    expect(data).toEqual({ leadId: expect.any(String), campaignId: draft._id, accountId: String(s.account._id) });
    expect(opts).toMatchObject({ attempts: 2, backoff: { type: "exponential", delay: 5000 } });
    expect(opts?.jobId).toMatch(/^conn-[a-f0-9]{24}-\d{8}$/);
    expect(opts?.delay).toBeGreaterThanOrEqual(0);
    expect(queues().inboxPollQueue.upsertJobScheduler).toHaveBeenCalledWith(
      `inbox-poll-${s.account._id}`,
      { every: 2 * 60 * 60 * 1000 },
      expect.objectContaining({ name: "poll-inbox" }),
    );
    expect((await Campaign.findById(draft._id))?.lastScheduledFor).toMatch(/^\d{8}$/);

    expect((await request(app).post(`/api/campaigns/${draft._id}/launch`).set(s.auth)).status).toBe(409);
  });

  it("the campaign dailyLimit setting further caps scheduled connections", async () => {
    const s = await setup();
    const draft = await createCampaign(s.workspace._id, s.account._id, s.list._id, {
      status: "draft",
      settings: { dailyLimit: 2 },
    });
    const res = await request(app).post(`/api/campaigns/${draft._id}/launch`).set(s.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.scheduled.connections).toBe(2);
  });

  it("launch is refused when the account is not active, the list is empty, or the list is in use", async () => {
    const s = await setup();
    const draft = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "draft" });
    s.account.status = "flagged";
    await s.account.save();
    expect((await request(app).post(`/api/campaigns/${draft._id}/launch`).set(s.auth)).status).toBe(422);
    s.account.status = "active";
    await s.account.save();

    const { list: empty } = await createListWithLeads(s.workspace._id, 0);
    const emptyDraft = await createCampaign(s.workspace._id, s.account._id, empty._id, { status: "draft" });
    expect((await request(app).post(`/api/campaigns/${emptyDraft._id}/launch`).set(s.auth)).status).toBe(422);

    await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "active" });
    expect((await request(app).post(`/api/campaigns/${draft._id}/launch`).set(s.auth)).status).toBe(409);
  });

  it("a failed queue write returns 503 and rolls the launch back to draft", async () => {
    const s = await setup();
    const draft = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "draft" });
    queues().connectionQueue.add.mockRejectedValueOnce(new Error("redis down"));
    const res = await request(app).post(`/api/campaigns/${draft._id}/launch`).set(s.auth);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/redis down/);
    const after = await Campaign.findById(draft._id);
    expect(after?.status).toBe("draft");
    expect(after?.launchedAt).toBeUndefined();
  });

  it("a failed queue write on resume keeps the campaign paused", async () => {
    const s = await setup();
    const c = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "paused" });
    queues().connectionQueue.add.mockRejectedValueOnce(new Error("redis down"));
    const res = await request(app).post(`/api/campaigns/${c._id}/resume`).set(s.auth);
    expect(res.status).toBe(503);
    expect((await Campaign.findById(c._id))?.status).toBe("paused");
  });

  it("pause and resume transition correctly; active campaigns cannot be deleted", async () => {
    const s = await setup();
    const c = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "active" });
    expect((await request(app).delete(`/api/campaigns/${c._id}`).set(s.auth)).status).toBe(409);
    expect((await request(app).post(`/api/campaigns/${c._id}/resume`).set(s.auth)).status).toBe(409);

    const paused = await request(app).post(`/api/campaigns/${c._id}/pause`).set(s.auth);
    expect(paused.body.data.status).toBe("paused");
    expect(paused.body.data.pausedReason).toBe("manual");
    const { list: other } = await createListWithLeads(s.workspace._id, 1);
    expect(
      (await request(app).patch(`/api/campaigns/${c._id}`).set(s.auth).send({ leadListId: String(other._id) })).status,
    ).toBe(409);

    const resumed = await request(app).post(`/api/campaigns/${c._id}/resume`).set(s.auth);
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.campaign.status).toBe("active");
    expect(queues().connectionQueue.add).toHaveBeenCalled();
  });
});

describe("cancel / archive / transition", () => {
  it("cancel only applies to running or paused campaigns", async () => {
    const s = await setup();
    const draft = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "draft" });
    expect((await request(app).post(`/api/campaigns/${draft._id}/cancel`).set(s.auth)).status).toBe(409);

    const active = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "active" });
    const res = await request(app).post(`/api/campaigns/${active._id}/cancel`).set(s.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("cancelled");
    expect(res.body.data.completedAt).toBeTruthy();
    expect((await request(app).post(`/api/campaigns/${active._id}/cancel`).set(s.auth)).status).toBe(409);
  });

  it("archive works from any status and is idempotent", async () => {
    const s = await setup();
    const c = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "completed" });
    const first = await request(app).post(`/api/campaigns/${c._id}/archive`).set(s.auth);
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe("archived");
    const again = await request(app).post(`/api/campaigns/${c._id}/archive`).set(s.auth);
    expect(again.status).toBe(200);
    expect(again.body.data.status).toBe("archived");
  });

  it("transitionCampaign dispatches to launch, pause, resume, cancel and archive", async () => {
    const s = await setup();
    const c = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "draft" });
    const id = String(c._id);
    expect((await campaignsDomain.transitionCampaign(s.ctx, id, "active")).status).toBe("active");
    expect(queues().connectionQueue.add).toHaveBeenCalled();
    await expect(campaignsDomain.transitionCampaign(s.ctx, id, "active")).rejects.toMatchObject({ status: 409 });
    expect((await campaignsDomain.transitionCampaign(s.ctx, id, "paused")).status).toBe("paused");
    expect((await campaignsDomain.transitionCampaign(s.ctx, id, "active")).status).toBe("active");
    expect((await campaignsDomain.transitionCampaign(s.ctx, id, "cancelled")).status).toBe("cancelled");
    await expect(campaignsDomain.transitionCampaign(s.ctx, id, "active")).rejects.toMatchObject({ status: 409 });
    expect((await campaignsDomain.transitionCampaign(s.ctx, id, "archived")).status).toBe("archived");
    await expect(campaignsDomain.transitionCampaign(s.ctx, id, "completed")).rejects.toMatchObject({ status: 400 });
  });

  it("sendConnectionNow queues an immediate job and resets skipped leads", async () => {
    const s = await setup();
    const active = await createCampaign(s.workspace._id, s.account._id, s.list._id, { status: "active" });
    const lead = await Lead.findOne({ listId: s.list._id });
    expect(lead).toBeTruthy();
    await Lead.updateOne({ _id: lead!._id }, { status: "skipped", skipReason: "send_failed:SESSION_EXPIRED" });

    queues().connectionQueue.add.mockClear();
    await campaignsDomain.sendConnectionNow(s.ctx, String(active._id), String(lead!._id));

    expect(queues().connectionQueue.add).toHaveBeenCalledTimes(1);
    const [name, , opts] = queues().connectionQueue.add.mock.calls[0];
    expect(name).toBe("send-connection");
    expect(opts).toMatchObject({ delay: 0, attempts: 2 });
    expect(String(opts?.jobId)).toMatch(/^conn-now-/);

    const updated = await Lead.findById(lead!._id);
    expect(updated?.status).toBe("pending");
    expect(updated?.skipReason).toBeFalsy();
  });
});
