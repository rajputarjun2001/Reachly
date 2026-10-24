import { describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, registerUser, request } from "./factory";
import { User } from "../models";
import { signSession, verifySession } from "../auth/token";
import * as authDomain from "../domain/auth";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

describe("auth API", () => {
  it("registers a user with a workspace and returns a usable token", async () => {
    const { token, user, workspace } = await registerUser({ email: "Owner@Example.com" });
    expect(user.email).toBe("owner@example.com");
    expect(user.role).toBe("owner");
    expect(String(user.workspaceId)).toBe(String(workspace._id));
    expect(JSON.stringify(user)).not.toContain("passwordHash");

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.workspace.name).toBe("Test Workspace");
  });

  it("rejects duplicate emails with 409", async () => {
    await registerUser({ email: "dupe@example.com" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "dupe@example.com", password: "password123", workspaceName: "X" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBeTruthy();
  });

  it("validates email, password and workspace name", async () => {
    const bad = await request(app).post("/api/auth/register").send({ email: "nope", password: "password123", workspaceName: "W" });
    expect(bad.status).toBe(400);
    const short = await request(app).post("/api/auth/register").send({ email: "a@b.co", password: "short", workspaceName: "W" });
    expect(short.status).toBe(400);
    const noWs = await request(app).post("/api/auth/register").send({ email: "a@b.co", password: "password123" });
    expect(noWs.status).toBe(400);
  });

  it("logs in with valid credentials and gives a generic 401 otherwise", async () => {
    await registerUser({ email: "login@example.com", password: "password123" });
    const good = await request(app).post("/api/auth/login").send({ email: "login@example.com", password: "password123" });
    expect(good.status).toBe(200);
    expect(good.body.data.token).toBeTruthy();

    const wrong = await request(app).post("/api/auth/login").send({ email: "login@example.com", password: "wrongpass1" });
    const missing = await request(app).post("/api/auth/login").send({ email: "ghost@example.com", password: "password123" });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error).toBe(missing.body.error);
  });

  it("accepts the session cookie as well as the bearer header", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/api/auth/me").set("Cookie", `reachly_session=${token}`);
    expect(res.status).toBe(200);
  });

  it("rejects missing, malformed and forged tokens", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect((await request(app).get("/api/auth/me").set("Authorization", "Bearer nope")).status).toBe(401);
    const forged = await signSession({ userId: "507f1f77bcf86cd799439011", workspaceId: null, role: "owner" }, "1s");
    process.env.JWT_SECRET = "another-secret-that-is-at-least-32-chars!!";
    try {
      expect(await verifySession(forged)).toBeNull();
    } finally {
      process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters";
    }
  });

  it("two-step signup: user first, then workspace with a reissued token", async () => {
    const user = await authDomain.registerUser({ email: "two@step.io", password: "password123", fullName: "Two" });
    expect(user.workspaceId).toBeNull();
    const firstToken = await authDomain.issueToken(user);
    expect((await verifySession(firstToken))?.workspaceId).toBeNull();

    const blocked = await request(app).get("/api/leads/lists").set("Authorization", `Bearer ${firstToken}`);
    expect(blocked.status).toBe(401);

    const res = await request(app).post("/api/auth/workspace").set("Authorization", `Bearer ${firstToken}`).send({ name: "Acme Co" });
    expect(res.status).toBe(201);
    expect(res.body.data.workspace.slug).toBe("acme-co");
    const claims = await verifySession(res.body.data.token);
    expect(claims?.workspaceId).toBe(String(res.body.data.workspace._id));
    expect(claims?.role).toBe("owner");
  });
});

describe("workspace members", () => {
  it("invites a member who can accept and log in", async () => {
    const owner = await registerUser();
    const invite = await request(app).post("/api/workspace/invite").set(owner.auth).send({ email: "member@example.com" });
    expect(invite.status).toBe(201);
    expect(invite.body.data.inviteToken).toHaveLength(64);

    const stored = await User.findOne({ email: "member@example.com" }).select("+inviteToken");
    expect(stored?.inviteToken).not.toBe(invite.body.data.inviteToken);

    const accept = await request(app)
      .post("/api/auth/accept-invite")
      .send({ token: invite.body.data.inviteToken, password: "password123", fullName: "Member" });
    expect(accept.status).toBe(200);
    expect(accept.body.data.user.role).toBe("member");

    const again = await request(app).post("/api/auth/accept-invite").send({ token: invite.body.data.inviteToken, password: "password123" });
    expect(again.status).toBe(404);

    const members = await request(app).get("/api/workspace/members").set(owner.auth);
    expect(members.body.data).toHaveLength(2);
  });

  it("only owners can invite or remove; the owner cannot be removed", async () => {
    const owner = await registerUser();
    const invite = await request(app).post("/api/workspace/invite").set(owner.auth).send({ email: "m2@example.com" });
    const accept = await request(app).post("/api/auth/accept-invite").send({ token: invite.body.data.inviteToken, password: "password123" });
    const memberAuth = { Authorization: `Bearer ${accept.body.data.token}` };

    const forbidden = await request(app).post("/api/workspace/invite").set(memberAuth).send({ email: "m3@example.com" });
    expect(forbidden.status).toBe(403);

    const removeSelf = await request(app).delete(`/api/workspace/members/${owner.user._id}`).set(owner.auth);
    expect(removeSelf.status).toBe(400);

    const removeMember = await request(app).delete(`/api/workspace/members/${accept.body.data.user._id}`).set(owner.auth);
    expect(removeMember.status).toBe(200);
  });
});
