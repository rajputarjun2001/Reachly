import { describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, createAccount, createWorkspaceFixture, registerUser, request } from "./factory";
import { LinkedInAccount, User, Workspace } from "../models";
import * as blacklist from "../domain/blacklist";
import * as settings from "../domain/settings";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

describe("blacklist API", () => {
  it("adds normalised entries, lists with pagination, and deletes", async () => {
    const u = await registerUser();
    const d = await request(app).post("/api/blacklist").set(u.auth).send({ type: "domain", value: "https://www.Competitor.com/about" });
    expect(d.status).toBe(201);
    expect(d.body.data.value).toBe("competitor.com");
    const p = await request(app).post("/api/blacklist").set(u.auth).send({ type: "profile_url", value: "linkedin.com/in/Someone/" });
    expect(p.body.data.value).toBe("https://www.linkedin.com/in/someone");

    expect((await request(app).post("/api/blacklist").set(u.auth).send({ type: "domain", value: "competitor.com" })).status).toBe(409);
    expect((await request(app).post("/api/blacklist").set(u.auth).send({ type: "email", value: "x" })).status).toBe(400);
    expect(
      (await request(app).post("/api/blacklist").set(u.auth).send({ type: "profile_url", value: "https://x.com/in/a" })).status,
    ).toBe(400);
    expect((await request(app).post("/api/blacklist").set(u.auth).send({ type: "domain", value: "nodot" })).status).toBe(400);
    expect((await request(app).post("/api/blacklist").set(u.auth).send({ type: "domain", value: "  " })).status).toBe(400);

    const list = await request(app).get("/api/blacklist?limit=1").set(u.auth);
    expect(list.body.data).toMatchObject({ total: 2, pages: 2 });
    expect(list.body.data.entries).toHaveLength(1);
    const filtered = await request(app).get("/api/blacklist?type=domain").set(u.auth);
    expect(filtered.body.data.total).toBe(1);
    const searched = await request(app).get("/api/blacklist").query({ search: "SOMEONE" }).set(u.auth);
    expect(searched.body.data.total).toBe(1);

    const other = await registerUser();
    expect((await request(app).get("/api/blacklist").set(other.auth)).body.data.total).toBe(0);
    expect((await request(app).delete(`/api/blacklist/${d.body.data._id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).delete(`/api/blacklist/${d.body.data._id}`).set(u.auth)).status).toBe(200);
    expect((await request(app).get("/api/blacklist").set(u.auth)).body.data.total).toBe(1);
  });

  it("the same value may be blacklisted by different workspaces", async () => {
    const a = await createWorkspaceFixture();
    const b = await createWorkspaceFixture();
    await blacklist.addEntry(a.ctx, { type: "domain", value: "acme.com" });
    await expect(blacklist.addEntry(b.ctx, { type: "domain", value: "acme.com" })).resolves.toBeTruthy();
    expect(blacklist.normalizeBlacklistValue("domain", "jane@Sub.Acme.com")).toBe("sub.acme.com");
    expect(() => blacklist.normalizeBlacklistValue("profile_url", "")).toThrow("A value is required");
    await expect(blacklist.removeEntry(a.ctx, "bad")).rejects.toMatchObject({ status: 400 });
  });
});

describe("PATCH /api/settings/workspace", () => {
  it("updates fields and enforces the starter plan limit", async () => {
    const u = await registerUser();
    const ok = await request(app)
      .patch("/api/settings/workspace")
      .set(u.auth)
      .send({ name: "Renamed", dailyLimitPerAccount: 7, sendingWindowStart: 9, sendingWindowEnd: 17, sendOnWeekends: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      name: "Renamed",
      dailyLimitPerAccount: 7,
      sendingWindowStart: 9,
      sendingWindowEnd: 17,
      sendOnWeekends: true,
    });

    const over = await request(app).patch("/api/settings/workspace").set(u.auth).send({ dailyLimitPerAccount: 11 });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/starter/);

    await Workspace.updateOne({ _id: u.workspace._id }, { plan: "growth" });
    expect((await request(app).patch("/api/settings/workspace").set(u.auth).send({ dailyLimitPerAccount: 25 })).status).toBe(200);
    expect((await request(app).patch("/api/settings/workspace").set(u.auth).send({ dailyLimitPerAccount: 51 })).status).toBe(400);
  });

  it("validates windows and types", async () => {
    const u = await registerUser();
    const patch = (body: Record<string, unknown>) => request(app).patch("/api/settings/workspace").set(u.auth).send(body);
    expect((await patch({ sendingWindowStart: 21 })).status).toBe(400);
    expect((await patch({ sendingWindowEnd: 25 })).status).toBe(400);
    expect((await patch({ sendingWindowStart: 8.5 })).status).toBe(400);
    expect((await patch({ sendOnWeekends: "yes" })).status).toBe(400);
    expect((await patch({ name: "  " })).status).toBe(400);
    expect((await patch({ dailyLimitPerAccount: 0 })).status).toBe(400);
    const ws = await Workspace.findById(u.workspace._id);
    expect(ws?.toObject()).toMatchObject({ sendingWindowStart: 8, sendingWindowEnd: 20, sendOnWeekends: false });
  });

  it("sets a validated IANA timezone", async () => {
    const u = await registerUser();
    const ok = await request(app).patch("/api/settings/workspace").set(u.auth).send({ timezone: "Asia/Kolkata" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.timezone).toBe("Asia/Kolkata");
    const bad = await request(app).patch("/api/settings/workspace").set(u.auth).send({ timezone: "Mars/Olympus" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/IANA/);
    expect((await request(app).patch("/api/settings/workspace").set(u.auth).send({ timezone: 5 })).status).toBe(400);
    expect((await Workspace.findById(u.workspace._id))?.timezone).toBe("Asia/Kolkata");
  });

  it("lowering the workspace limit clamps account limits", async () => {
    const u = await registerUser();
    const account = await createAccount(u.workspace._id, { dailyLimit: 10 });
    const low = await createAccount(u.workspace._id, { dailyLimit: 3 });
    await request(app).patch("/api/settings/workspace").set(u.auth).send({ dailyLimitPerAccount: 5 });
    expect((await LinkedInAccount.findById(account._id))?.dailyLimit).toBe(5);
    expect((await LinkedInAccount.findById(low._id))?.dailyLimit).toBe(3);
  });

  it("only the owner can change workspace settings", async () => {
    const owner = await registerUser();
    const inv = await request(app).post("/api/workspace/invite").set(owner.auth).send({ email: "m@x.com" });
    const acc = await request(app).post("/api/auth/accept-invite").send({ token: inv.body.data.inviteToken, password: "memberpass1" });
    const res = await request(app)
      .patch("/api/settings/workspace")
      .set({ Authorization: `Bearer ${acc.body.data.token}` })
      .send({ name: "x" });
    expect(res.status).toBe(403);
    const fx = await createWorkspaceFixture();
    await expect(settings.updateWorkspace({ ...fx.ctx, role: "member" }, { name: "x" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("profile and password", () => {
  it("updates fullName and timezone", async () => {
    const u = await registerUser();
    const res = await request(app).patch("/api/settings/profile").set(u.auth).send({ fullName: "New Name", timezone: "Asia/Kolkata" });
    expect(res.body.data).toMatchObject({ fullName: "New Name", timezone: "Asia/Kolkata" });
    expect((await request(app).patch("/api/settings/profile").set(u.auth).send({ timezone: "Mars/Base" })).status).toBe(400);
  });

  it("changes password after verifying the old one", async () => {
    const u = await registerUser({ email: "pw@x.com" });
    const change = (body: Record<string, unknown>) => request(app).post("/api/settings/change-password").set(u.auth).send(body);
    expect((await change({ oldPassword: "wrongpass", newPassword: "newpassword1" })).status).toBe(401);
    expect((await change({ oldPassword: u.password, newPassword: "short" })).status).toBe(400);
    expect((await change({ oldPassword: u.password, newPassword: "newpassword1" })).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ email: "pw@x.com", password: u.password })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "pw@x.com", password: "newpassword1" })).status).toBe(200);
    expect(await User.countDocuments()).toBe(1);
  });
});
