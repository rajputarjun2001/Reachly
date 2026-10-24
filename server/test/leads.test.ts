import { describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, createAccount, createCampaign, createWorkspaceFixture, registerUser, request } from "./factory";
import { Blacklist, Campaign, Lead, LeadList } from "../models";
import * as leadsDomain from "../domain/leads";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

type Auth = { Authorization: string };

async function createList(auth: Auth, name = "My list") {
  const res = await request(app).post("/api/leads/lists").set(auth).send({ name });
  expect(res.status).toBe(201);
  return res.body.data as { _id: string; name: string };
}

const upload = (auth: Auth, listId: string, csv: string, filename = "leads.csv") =>
  request(app)
    .post(`/api/leads/lists/${listId}/upload`)
    .set(auth)
    .attach("file", Buffer.from(csv), { filename, contentType: "text/csv" });

describe("lead lists", () => {
  it("creates and lists lists for the workspace only", async () => {
    const a = await registerUser();
    const b = await registerUser();
    await createList(a.auth, "A list");
    await createList(b.auth, "B list");
    const res = await request(app).get("/api/leads/lists").set(a.auth);
    expect(res.body.data.map((l: { name: string }) => l.name)).toEqual(["A list"]);
    expect((await request(app).post("/api/leads/lists").set(a.auth).send({})).status).toBe(400);
  });

  it("requires auth", async () => {
    expect((await request(app).get("/api/leads/lists")).status).toBe(401);
  });

  it("PATCH renames a list, validating the name and the workspace", async () => {
    const a = await registerUser();
    const b = await registerUser();
    const list = await createList(a.auth, "Old");
    const res = await request(app).patch(`/api/leads/lists/${list._id}`).set(a.auth).send({ name: "  New name " });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("New name");
    expect((await LeadList.findById(list._id))?.name).toBe("New name");
    expect((await request(app).patch(`/api/leads/lists/${list._id}`).set(a.auth).send({ name: "" })).status).toBe(400);
    expect(
      (await request(app).patch(`/api/leads/lists/${list._id}`).set(a.auth).send({ name: "x".repeat(121) })).status,
    ).toBe(400);
    expect((await request(app).patch(`/api/leads/lists/${list._id}`).set(b.auth).send({ name: "Hijack" })).status).toBe(404);
  });

  it("listListsWithCounts reports live lead counts and stores descriptions", async () => {
    const { ctx } = await createWorkspaceFixture();
    const withDesc = await leadsDomain.createList(ctx, { name: "Described", description: "  hello " });
    expect(withDesc.description).toBe("hello");
    const empty = await leadsDomain.createList(ctx, { name: "Empty" });
    await leadsDomain.createLead(ctx, String(withDesc._id), { linkedinUrl: "https://www.linkedin.com/in/one" });
    await leadsDomain.createLead(ctx, String(withDesc._id), { linkedinUrl: "https://www.linkedin.com/in/two" });
    await LeadList.updateOne({ _id: withDesc._id }, { totalLeads: 99 });

    const rows = await leadsDomain.listListsWithCounts(ctx);
    const byName = Object.fromEntries(rows.map((r) => [r.list.name, r.leadCount]));
    expect(byName).toEqual({ Described: 2, Empty: 0 });
    expect(rows.find((r) => String(r.list._id) === String(empty._id))?.leadCount).toBe(0);
  });
});

describe("CSV upload", () => {
  it("imports valid rows, skips duplicates/invalid, counts blacklisted", async () => {
    const u = await registerUser();
    const list = await createList(u.auth);
    await Blacklist.create([
      { workspaceId: u.workspace._id, type: "profile_url", value: "https://www.linkedin.com/in/blocked" },
      { workspaceId: u.workspace._id, type: "domain", value: "competitor.com" },
    ]);

    const csv = [
      "linkedin_url,first_name,last_name,email,company,title",
      "https://www.linkedin.com/in/jane/,Jane,Doe,jane@acme.com,Acme,CEO",
      "https://linkedin.com/in/JANE,Jane,Dup,,,",
      "https://www.linkedin.com/in/blocked,B,L,,,",
      "https://www.linkedin.com/in/rival,R,V,r@competitor.com,Rival,CTO",
      "not-a-url,X,Y,,,",
      ",Empty,Url,,,",
      "https://www.linkedin.com/in/john,John,Smith,,Beta,VP",
    ].join("\n");

    const res = await upload(u.auth, list._id, csv);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ imported: 2, skipped: 3, blacklisted: 2, totalLeads: 2 });

    const leads = await Lead.find({ listId: list._id }).sort({ linkedinUrl: 1 });
    expect(leads.map((l) => l.linkedinUrl)).toEqual([
      "https://www.linkedin.com/in/jane",
      "https://www.linkedin.com/in/john",
    ]);
    expect(leads.every((l) => l.status === "pending" && l.source === "csv_import")).toBe(true);
    expect(leads[0].toObject()).toMatchObject({
      firstName: "Jane",
      lastName: "Doe",
      company: "Acme",
      title: "CEO",
      email: "jane@acme.com",
    });

    const again = await upload(u.auth, list._id, csv);
    expect(again.body.data).toMatchObject({ imported: 0, totalLeads: 2 });
    expect((await LeadList.findById(list._id))?.uploadedAt).toBeInstanceOf(Date);
  });

  it("returns 422 for missing file, missing column, and non-CSV files", async () => {
    const u = await registerUser();
    const list = await createList(u.auth);
    const noFile = await request(app).post(`/api/leads/lists/${list._id}/upload`).set(u.auth);
    expect(noFile.status).toBe(422);
    const noCol = await upload(u.auth, list._id, "name,company\nA,B");
    expect(noCol.status).toBe(422);
    expect(noCol.body.error).toMatch(/linkedin_url/);
    const notCsv = await request(app)
      .post(`/api/leads/lists/${list._id}/upload`)
      .set(u.auth)
      .attach("file", Buffer.from("x"), { filename: "photo.png", contentType: "image/png" });
    expect(notCsv.status).toBe(422);
  });

  it("rejects files over 10MB", async () => {
    const u = await registerUser();
    const list = await createList(u.auth);
    const big = `linkedin_url\n${"https://www.linkedin.com/in/a\n".repeat(400000)}`;
    const res = await upload(u.auth, list._id, big);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/10MB/);
  });

  it("cannot upload into another workspace's list", async () => {
    const a = await registerUser();
    const b = await registerUser();
    const list = await createList(b.auth);
    const res = await upload(a.auth, list._id, "linkedin_url\nhttps://www.linkedin.com/in/a");
    expect(res.status).toBe(404);
  });

  it("importCsvAsNewList creates the list and imports; unparseable files create nothing", async () => {
    const { ctx } = await createWorkspaceFixture();
    const { list, summary } = await leadsDomain.importCsvAsNewList(
      ctx,
      "Imported",
      "linkedin_url,first_name\nhttps://www.linkedin.com/in/a,A\nhttps://www.linkedin.com/in/b,B\nbad,C",
    );
    expect(list.name).toBe("Imported");
    expect(summary).toEqual({ imported: 2, skipped: 1, blacklisted: 0, totalLeads: 2 });
    expect(await Lead.countDocuments({ listId: list._id })).toBe(2);

    await expect(leadsDomain.importCsvAsNewList(ctx, "Broken", "name\nx")).rejects.toMatchObject({ status: 422 });
    await expect(leadsDomain.importCsvAsNewList(ctx, "", "linkedin_url\nhttps://www.linkedin.com/in/c")).rejects.toMatchObject({
      status: 400,
    });
    expect(await LeadList.countDocuments({ workspaceId: ctx.workspaceId })).toBe(1);
  });
});

describe("GET /api/leads/lists/:id/leads", () => {
  it("paginates and filters by status", async () => {
    const u = await registerUser();
    const list = await createList(u.auth);
    const rows = Array.from({ length: 7 }, (_, i) => `https://www.linkedin.com/in/p${i}`);
    await upload(u.auth, list._id, `linkedin_url\n${rows.join("\n")}`);
    await Lead.updateMany({ linkedinUrl: { $in: rows.slice(0, 2) } }, { status: "connection_sent" });

    const page1 = await request(app).get(`/api/leads/lists/${list._id}/leads?limit=3&page=1`).set(u.auth);
    expect(page1.body.data).toMatchObject({ total: 7, page: 1, limit: 3, pages: 3 });
    expect(page1.body.data.leads).toHaveLength(3);
    const page3 = await request(app).get(`/api/leads/lists/${list._id}/leads?limit=3&page=3`).set(u.auth);
    expect(page3.body.data.leads).toHaveLength(1);

    const sent = await request(app).get(`/api/leads/lists/${list._id}/leads?status=connection_sent`).set(u.auth);
    expect(sent.body.data.total).toBe(2);
    expect((await request(app).get(`/api/leads/lists/${list._id}/leads?status=bogus`).set(u.auth)).status).toBe(400);
    expect((await request(app).get("/api/leads/lists/not-an-id/leads").set(u.auth)).status).toBe(400);
  });

  it("searches across name, company, email and URL (regex-safe)", async () => {
    const u = await registerUser();
    const list = await createList(u.auth);
    await upload(
      u.auth,
      list._id,
      [
        "linkedin_url,first_name,last_name,email,company",
        "https://www.linkedin.com/in/ann,Ann,Lee,ann@zeta.io,Zeta",
        "https://www.linkedin.com/in/bob,Bob,Ray,bob@acme.com,Acme",
        "https://www.linkedin.com/in/cyd,Cyd,Moe,,Acme (EU)",
      ].join("\n"),
    );
    const search = async (q: string) =>
      (await request(app).get(`/api/leads/lists/${list._id}/leads`).query({ search: q }).set(u.auth)).body.data.total as number;
    expect(await search("acme")).toBe(2);
    expect(await search("ZETA")).toBe(1);
    expect(await search("in/bob")).toBe(1);
    expect(await search("(EU)")).toBe(1);
    expect(await search(".*")).toBe(0);
  });
});

describe("single lead CRUD", () => {
  it("createLead normalises, rejects duplicates and bad input, and refreshes the list count", async () => {
    const { ctx } = await createWorkspaceFixture();
    const list = await leadsDomain.createList(ctx, { name: "L" });
    const lead = await leadsDomain.createLead(ctx, String(list._id), {
      linkedinUrl: "linkedin.com/in/Jane/",
      firstName: " Jane ",
      email: "JANE@Acme.com",
    });
    expect(lead.toObject()).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/jane",
      firstName: "Jane",
      email: "jane@acme.com",
      source: "manual",
      status: "pending",
    });
    expect((await LeadList.findById(list._id))?.totalLeads).toBe(1);

    await expect(
      leadsDomain.createLead(ctx, String(list._id), { linkedinUrl: "https://www.linkedin.com/in/jane" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(leadsDomain.createLead(ctx, String(list._id), { linkedinUrl: "https://x.com/in/a" })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      leadsDomain.createLead(ctx, String(list._id), { linkedinUrl: "https://www.linkedin.com/in/b", email: "nope" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updateLead and deleteLead are workspace scoped and keep counts in sync", async () => {
    const { ctx } = await createWorkspaceFixture();
    const other = await createWorkspaceFixture();
    const list = await leadsDomain.createList(ctx, { name: "L" });
    const a = await leadsDomain.createLead(ctx, String(list._id), { linkedinUrl: "https://www.linkedin.com/in/a" });
    await leadsDomain.createLead(ctx, String(list._id), { linkedinUrl: "https://www.linkedin.com/in/b" });

    const updated = await leadsDomain.updateLead(ctx, String(a._id), {
      linkedinUrl: "https://www.linkedin.com/in/a",
      company: "NewCo",
    });
    expect(updated.company).toBe("NewCo");
    await expect(
      leadsDomain.updateLead(ctx, String(a._id), { linkedinUrl: "https://www.linkedin.com/in/b" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      leadsDomain.updateLead(other.ctx, String(a._id), { linkedinUrl: "https://www.linkedin.com/in/a" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(leadsDomain.deleteLead(other.ctx, String(a._id))).rejects.toMatchObject({ status: 404 });

    await leadsDomain.deleteLead(ctx, String(a._id));
    expect(await Lead.countDocuments({ listId: list._id })).toBe(1);
    expect((await LeadList.findById(list._id))?.totalLeads).toBe(1);
    await expect(leadsDomain.deleteLead(ctx, "bad-id")).rejects.toMatchObject({ status: 400 });
  });
});

describe("DELETE /api/leads/lists/:id", () => {
  it("deletes list and its leads, but not while a campaign is running", async () => {
    const u = await registerUser();
    const list = await createList(u.auth);
    await upload(u.auth, list._id, "linkedin_url\nhttps://www.linkedin.com/in/a");

    const account = await createAccount(u.workspace._id);
    const campaign = await createCampaign(u.workspace._id, account._id, list._id, { status: "active" });
    expect((await request(app).delete(`/api/leads/lists/${list._id}`).set(u.auth)).status).toBe(409);
    campaign.status = "paused";
    await campaign.save();
    expect((await request(app).delete(`/api/leads/lists/${list._id}`).set(u.auth)).status).toBe(409);

    campaign.status = "completed";
    await campaign.save();
    const res = await request(app).delete(`/api/leads/lists/${list._id}`).set(u.auth);
    expect(res.status).toBe(200);
    expect(await Lead.countDocuments({ listId: list._id })).toBe(0);
    expect(await LeadList.countDocuments()).toBe(0);
    expect((await Campaign.findById(campaign._id))?.leadListId).toBeNull();
  });

  it("nulls leadListId on draft campaigns that referenced the list", async () => {
    const { ctx, workspace } = await createWorkspaceFixture();
    const list = await leadsDomain.createList(ctx, { name: "L" });
    const draft = await createCampaign(workspace._id, null, list._id, { status: "draft" });
    await leadsDomain.deleteList(ctx, String(list._id));
    expect((await Campaign.findById(draft._id))?.leadListId).toBeNull();
  });
});
