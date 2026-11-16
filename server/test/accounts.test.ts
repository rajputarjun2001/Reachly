import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, createAccount, createCampaign, createListWithLeads, createWorkspaceFixture, request } from "./factory";
import { AutomationEvent, Campaign, LinkedInAccount } from "../models";
import { getQueues } from "../services/scheduler/queues";
import * as li from "../services/playwright/linkedinActions";
import { runHealthChecks } from "../services/scheduler/maintenanceProcessor";
import * as accountsDomain from "../domain/accounts";
import { decrypt, decryptJSON, isEncrypted } from "../utils/encryption";
import { ensureContainer, wsEndpointFor } from "../services/docker/containerManager";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");
vi.mock("../services/proxyCheck", () => ({ checkProxy: vi.fn(async () => undefined) }));

useTestDb();

const queues = () => vi.mocked(getQueues(), true);
const COOKIES = (li as unknown as { COOKIES: unknown[] }).COOKIES;
const loginToLinkedIn = vi.mocked(li.loginToLinkedIn);
const verifyCookies = vi.mocked(li.verifyCookies);
const fetchOwnProfile = vi.mocked(li.fetchOwnProfile);

beforeEach(() => {
  vi.clearAllMocks();
});

type Auth = { Authorization: string };
const connect = (auth: Auth, body: Record<string, unknown>) => request(app).post("/api/accounts").set(auth).send(body);

describe("POST /api/accounts", () => {
  it("logs in, stores encrypted password + cookies, fetches profile and schedules inbox polling", async () => {
    const fx = await createWorkspaceFixture();
    const res = await connect(fx.auth, {
      linkedinEmail: "Me@LinkedIn.com",
      linkedinPassword: "pw-123",
      dailyLimit: 8,
      label: " Sales seat ",
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: "active",
      linkedinEmail: "me@linkedin.com",
      dailyLimit: 8,
      fullName: "Li User",
      headline: "Founder",
      label: "Sales seat",
    });
    expect(res.body.data.linkedinPasswordEncrypted).toBeUndefined();
    expect(res.body.data.sessionCookies).toBeUndefined();

    expect(loginToLinkedIn).toHaveBeenCalledWith("me@linkedin.com", "pw-123", expect.any(Object));
    const stored = await LinkedInAccount.findById(res.body.data._id).select("+linkedinPasswordEncrypted +sessionCookies");
    expect(isEncrypted(stored?.linkedinPasswordEncrypted)).toBe(true);
    expect(decrypt(stored!.linkedinPasswordEncrypted!)).toBe("pw-123");
    expect(decryptJSON(stored!.sessionCookies!)).toEqual(COOKIES);
    expect(queues().inboxPollQueue.upsertJobScheduler).toHaveBeenCalledWith(
      `inbox-poll-${stored?._id}`,
      expect.any(Object),
      expect.any(Object),
    );
    expect(await AutomationEvent.countDocuments({ eventType: "session_refreshed" })).toBe(1);
  });

  it("a failed profile scrape does not block connecting", async () => {
    const fx = await createWorkspaceFixture();
    fetchOwnProfile.mockRejectedValueOnce(new Error("timeout"));
    const res = await connect(fx.auth, { linkedinEmail: "p@li.com", linkedinPassword: "pw" });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("active");
    expect(res.body.data.fullName).toBeUndefined();
  });

  it("CHALLENGE_REQUIRED flags the account and returns 422 with the spec message and code", async () => {
    const fx = await createWorkspaceFixture();
    loginToLinkedIn.mockRejectedValueOnce(new Error("CHALLENGE_REQUIRED"));
    const res = await connect(fx.auth, { linkedinEmail: "c@li.com", linkedinPassword: "pw" });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: "LinkedIn requires verification. Please log in manually and try again." });
    const account = await LinkedInAccount.findOne({ linkedinEmail: "c@li.com" });
    expect(account?.status).toBe("flagged");
    expect(account?.flagReason).toBe("CHALLENGE_REQUIRED");

    loginToLinkedIn.mockRejectedValueOnce(new Error("CHALLENGE_REQUIRED"));
    await expect(
      accountsDomain.connectAccount(fx.ctx, { linkedinEmail: "c2@li.com", linkedinPassword: "pw" }),
    ).rejects.toMatchObject({ status: 422, code: "CHALLENGE_REQUIRED", message: accountsDomain.CHALLENGE_MESSAGE });
  });

  it("invalid credentials -> 422 and disconnected; unexpected errors -> 502", async () => {
    const fx = await createWorkspaceFixture();
    loginToLinkedIn.mockRejectedValueOnce(new Error("INVALID_CREDENTIALS"));
    const bad = await connect(fx.auth, { linkedinEmail: "i@li.com", linkedinPassword: "pw" });
    expect(bad.status).toBe(422);
    expect((await LinkedInAccount.findOne({ linkedinEmail: "i@li.com" }))?.status).toBe("disconnected");

    loginToLinkedIn.mockRejectedValueOnce(new Error("INVALID_CREDENTIALS"));
    await expect(
      accountsDomain.connectAccount(fx.ctx, { linkedinEmail: "i2@li.com", linkedinPassword: "pw" }),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CREDENTIALS" });

    loginToLinkedIn.mockRejectedValueOnce(new Error("net::ERR_TIMED_OUT"));
    const boom = await connect(fx.auth, { linkedinEmail: "n@li.com", linkedinPassword: "pw" });
    expect(boom.status).toBe(502);
    expect(boom.body.error).toBe(accountsDomain.CONNECT_LOGIN_FAILED);

    loginToLinkedIn.mockRejectedValueOnce(
      new Error(
        "browserType.launch: Executable doesn't exist at /opt/render/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
      ),
    );
    const missingBrowser = await connect(fx.auth, { linkedinEmail: "b@li.com", linkedinPassword: "pw" });
    expect(missingBrowser.status).toBe(502);
    expect(missingBrowser.body.error).toBe(accountsDomain.CONNECT_LOGIN_FAILED);
  });

  it("validates body, daily limit cap, and duplicates", async () => {
    const fx = await createWorkspaceFixture();
    expect((await connect(fx.auth, { linkedinPassword: "pw" })).status).toBe(400);
    expect((await connect(fx.auth, { linkedinEmail: "not-an-email", linkedinPassword: "pw" })).status).toBe(400);
    expect((await connect(fx.auth, { linkedinEmail: "a@li.com" })).status).toBe(400);
    expect((await connect(fx.auth, { linkedinEmail: "a@li.com", linkedinPassword: "pw", dailyLimit: 11 })).status).toBe(400);
    expect((await connect(fx.auth, { linkedinEmail: "a@li.com", linkedinPassword: "pw", dailyLimit: 0 })).status).toBe(400);
    const ok = await connect(fx.auth, { linkedinEmail: "a@li.com", linkedinPassword: "pw" });
    expect(ok.status).toBe(201);
    expect(ok.body.data.dailyLimit).toBe(10);
    expect((await connect(fx.auth, { linkedinEmail: "A@li.com", linkedinPassword: "pw" })).status).toBe(409);
  });

  it("the daily limit cap follows the plan and the workspace setting", async () => {
    const growth = await createWorkspaceFixture({ plan: "growth", dailyLimitPerAccount: 40 });
    expect(await accountsDomain.workspaceDailyCap(growth.ctx.workspaceId)).toBe(40);
    expect((await connect(growth.auth, { linkedinEmail: "g@li.com", linkedinPassword: "pw", dailyLimit: 41 })).status).toBe(400);
    expect((await connect(growth.auth, { linkedinEmail: "g@li.com", linkedinPassword: "pw", dailyLimit: 40 })).status).toBe(201);
    const starter = await createWorkspaceFixture({ plan: "starter", dailyLimitPerAccount: 50 });
    expect(await accountsDomain.workspaceDailyCap(starter.ctx.workspaceId)).toBe(10);
  });
});

const IMPORTED_SESSION = "li_at=AQEDAS1234567890abcdefghijklmnop; JSESSIONID=imported-session";

describe("POST /api/accounts/connect/session", () => {
  it("stores encrypted cookies after verifying a pasted session", async () => {
    const fx = await createWorkspaceFixture();
    const res = await request(app)
      .post("/api/accounts/connect/session")
      .set(fx.auth)
      .send({
        linkedinEmail: "session@li.com",
        sessionCookies: IMPORTED_SESSION,
        label: "Imported",
        dailyLimit: 6,
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: "active",
      linkedinEmail: "session@li.com",
      label: "Imported",
      dailyLimit: 6,
    });
    expect(loginToLinkedIn).not.toHaveBeenCalled();
    expect(verifyCookies).toHaveBeenCalled();
    const stored = await LinkedInAccount.findById(res.body.data._id).select("+sessionCookies +linkedinPasswordEncrypted");
    expect(stored?.linkedinPasswordEncrypted).toBeUndefined();
    const cookies = decryptJSON<{ name: string; value: string }[]>(stored!.sessionCookies!);
    expect(cookies.some((c) => c.name === "li_at" && c.value === "AQEDAS1234567890abcdefghijklmnop")).toBe(true);
  });

  it("rejects bare li_at-only paste with 400", async () => {
    const fx = await createWorkspaceFixture();
    const res = await request(app)
      .post("/api/accounts/connect/session")
      .set(fx.auth)
      .send({ linkedinEmail: "bare@li.com", sessionCookies: "AQEDAS1234567890abcdefghijklmnop" });
    expect(res.status).toBe(400);
    expect(verifyCookies).not.toHaveBeenCalled();
  });

  it("rejects invalid cookies with 422", async () => {
    const fx = await createWorkspaceFixture();
    verifyCookies.mockResolvedValueOnce({ valid: false });
    const res = await request(app)
      .post("/api/accounts/connect/session")
      .set(fx.auth)
      .send({ linkedinEmail: "bad@li.com", sessionCookies: IMPORTED_SESSION });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe(accountsDomain.INVALID_SESSION_COOKIES);
  });
});

describe("account read endpoints", () => {
  it("lists accounts for the workspace and reports status", async () => {
    const fx = await createWorkspaceFixture();
    const other = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id, { todaySentCount: 4 });
    await createAccount(other.workspace._id);

    const list = await request(app).get("/api/accounts").set(fx.auth);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body.data)).not.toMatch(/sessionCookies|linkedinPassword/);

    const status = await request(app).get(`/api/accounts/${account._id}/status`).set(fx.auth);
    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({ status: "active", valid: true, todaySentCount: 4, dailyLimit: 10 });
    expect(status.body.data.lastHealthCheck).toBeTruthy();

    verifyCookies.mockResolvedValueOnce({ valid: false });
    const invalid = await request(app).get(`/api/accounts/${account._id}/status`).set(fx.auth);
    expect(invalid.body.data.valid).toBe(false);

    expect((await request(app).get(`/api/accounts/${account._id}/status`).set(other.auth)).status).toBe(404);
    expect((await request(app).get("/api/accounts/nope/status").set(fx.auth)).status).toBe(400);
  });

  it("accounts without cookies report invalid without opening a browser", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id, { sessionCookies: undefined });
    const status = await request(app).get(`/api/accounts/${account._id}/status`).set(fx.auth);
    expect(status.body.data.valid).toBe(false);
    expect(verifyCookies).not.toHaveBeenCalled();
  });
});

describe("account proxy", () => {
  const PROXY = "gate.example.com:7000:user-country-in:secret";
  const viaSession = (auth: Auth, body: Record<string, unknown>) =>
    request(app)
      .post("/api/accounts/connect/session")
      .set(auth)
      .send({ linkedinEmail: "proxy@li.com", sessionCookies: IMPORTED_SESSION, ...body });

  it("stores the proxy encrypted, never returns its credentials, and verifies the session through it", async () => {
    const fx = await createWorkspaceFixture({ timezone: "Asia/Kolkata" });
    const res = await viaSession(fx.auth, { proxyUrl: PROXY });
    expect(res.status).toBe(201);
    expect(res.body.data.proxyHost).toBe("gate.example.com:7000");
    expect(res.body.data.proxyUrlEncrypted).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("secret");

    const stored = await LinkedInAccount.findById(res.body.data._id);
    expect(isEncrypted(stored?.proxyUrlEncrypted)).toBe(true);
    expect(decrypt(stored!.proxyUrlEncrypted!)).toBe("http://user-country-in:secret@gate.example.com:7000");
    expect(stored?.timezone).toBe("Asia/Kolkata");
    expect(verifyCookies).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        proxy: { server: "http://gate.example.com:7000", username: "user-country-in", password: "secret" },
        timezoneId: "Asia/Kolkata",
      }),
    );
  });

  it("connects directly when no proxy is given", async () => {
    const fx = await createWorkspaceFixture();
    const res = await viaSession(fx.auth, {});
    expect(res.status).toBe(201);
    expect(res.body.data.proxyHost).toBeUndefined();
    expect(verifyCookies.mock.calls[0][1]?.proxy).toBeUndefined();
  });

  it("rejects a malformed proxy before creating the account", async () => {
    const fx = await createWorkspaceFixture();
    const res = await viaSession(fx.auth, { proxyUrl: "gate.example.com" });
    expect(res.status).toBe(400);
    expect(await LinkedInAccount.countDocuments()).toBe(0);
    expect(verifyCookies).not.toHaveBeenCalled();
  });

  it("reports a proxy that cannot reach LinkedIn instead of a generic failure", async () => {
    const fx = await createWorkspaceFixture();
    verifyCookies.mockRejectedValueOnce(new Error("PROXY_FAILED"));
    const res = await viaSession(fx.auth, { proxyUrl: PROXY });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/proxy/i);
    expect((await LinkedInAccount.findOne({ linkedinEmail: "proxy@li.com" }))?.status).toBe("disconnected");
  });

  it("PATCH sets, keeps and removes the proxy", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id);
    const patch = (body: Record<string, unknown>) => request(app).patch(`/api/accounts/${account._id}`).set(fx.auth).send(body);

    expect((await patch({ proxyUrl: PROXY })).body.data.proxyHost).toBe("gate.example.com:7000");
    expect((await patch({ label: "Renamed" })).body.data.proxyHost).toBe("gate.example.com:7000");
    expect((await patch({ proxyUrl: "not a proxy" })).status).toBe(400);
    const cleared = await patch({ proxyUrl: "" });
    expect(cleared.body.data.proxyHost).toBeUndefined();
    expect((await LinkedInAccount.findById(account._id))?.proxyUrlEncrypted).toBeUndefined();
  });

  it("uses the account proxy for sends and health checks, falling back to LINKEDIN_PROXY_URL", async () => {
    const fx = await createWorkspaceFixture();
    const own = await createAccount(fx.workspace._id);
    await request(app).patch(`/api/accounts/${own._id}`).set(fx.auth).send({ proxyUrl: PROXY });
    const bare = await createAccount(fx.workspace._id);

    vi.stubEnv("LINKEDIN_PROXY_URL", "http://fallback.example:9000");
    try {
      await runHealthChecks();
    } finally {
      vi.unstubAllEnvs();
    }
    const servers = verifyCookies.mock.calls.map(([, opts]) => opts?.proxy?.server).sort();
    expect(servers).toEqual(["http://fallback.example:9000", "http://gate.example.com:7000"]);
    expect(bare.proxyUrlEncrypted).toBeUndefined();
  });
});

describe("PATCH /api/accounts/:id", () => {
  it("updates the label and daily limit within the workspace cap", async () => {
    const fx = await createWorkspaceFixture();
    const other = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id);
    const res = await request(app).patch(`/api/accounts/${account._id}`).set(fx.auth).send({ label: " Main ", dailyLimit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ label: "Main", dailyLimit: 5 });

    expect((await request(app).patch(`/api/accounts/${account._id}`).set(fx.auth).send({ dailyLimit: 11 })).status).toBe(400);
    expect((await request(app).patch(`/api/accounts/${account._id}`).set(fx.auth).send({ dailyLimit: 2.5 })).status).toBe(400);
    const cleared = await request(app).patch(`/api/accounts/${account._id}`).set(fx.auth).send({ label: "" });
    expect(cleared.body.data.label).toBeUndefined();
    expect(cleared.body.data.dailyLimit).toBe(5);
    expect((await request(app).patch(`/api/accounts/${account._id}`).set(other.auth).send({ label: "x" })).status).toBe(404);
    expect(loginToLinkedIn).not.toHaveBeenCalled();
  });
});

describe("reconnect and delete", () => {
  it("reconnect logs in again with the stored password (or a new one)", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id, { status: "flagged", flagReason: "CHALLENGE_REQUIRED" });
    const res = await request(app).post(`/api/accounts/${account._id}/reconnect`).set(fx.auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
    expect(res.body.data.flagReason).toBeUndefined();
    expect(loginToLinkedIn).toHaveBeenLastCalledWith(account.linkedinEmail, "li-password", expect.any(Object));

    await request(app).post(`/api/accounts/${account._id}/reconnect`).set(fx.auth).send({ linkedinPassword: "new-pw" });
    expect(loginToLinkedIn).toHaveBeenLastCalledWith(account.linkedinEmail, "new-pw", expect.any(Object));
    const stored = await LinkedInAccount.findById(account._id).select("+linkedinPasswordEncrypted");
    expect(decrypt(stored!.linkedinPasswordEncrypted!)).toBe("new-pw");
  });

  it("reconnect without any stored password is a 400", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id, { linkedinPasswordEncrypted: undefined });
    expect((await request(app).post(`/api/accounts/${account._id}/reconnect`).set(fx.auth).send({})).status).toBe(400);
  });

  it("reconnect accepts pasted session cookies without a stored password", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id, {
      linkedinPasswordEncrypted: undefined,
      status: "disconnected",
    });
    const res = await request(app)
      .post(`/api/accounts/${account._id}/reconnect`)
      .set(fx.auth)
      .send({ sessionCookies: IMPORTED_SESSION });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("active");
    expect(verifyCookies).toHaveBeenCalled();
    expect(loginToLinkedIn).not.toHaveBeenCalled();
    const stored = await LinkedInAccount.findById(account._id).select("+sessionCookies");
    const cookies = decryptJSON<{ name: string; value: string }[]>(stored!.sessionCookies!);
    expect(cookies.some((c) => c.name === "li_at" && c.value === "AQEDAS1234567890abcdefghijklmnop")).toBe(true);
  });

  it("delete pauses campaigns, removes the inbox poll and the account", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id);
    const { list } = await createListWithLeads(fx.workspace._id, 1);
    const campaign = await createCampaign(fx.workspace._id, account._id, list._id, { status: "active" });
    const res = await request(app).delete(`/api/accounts/${account._id}`).set(fx.auth);
    expect(res.status).toBe(200);
    expect(await LinkedInAccount.countDocuments()).toBe(0);
    const paused = await Campaign.findById(campaign._id);
    expect(paused?.status).toBe("paused");
    expect(paused?.pausedReason).toBe("account_removed");
    expect(queues().inboxPollQueue.removeJobScheduler).toHaveBeenCalledWith(`inbox-poll-${account._id}`);
  });
});

describe("browser isolation", () => {
  it("with Docker disabled no container is started and browsers launch locally", async () => {
    expect(await ensureContainer("abc")).toBeNull();
    expect(wsEndpointFor({ containerPort: 5000 })).toBeUndefined();
    process.env.DOCKER_ENABLED = "true";
    try {
      expect(wsEndpointFor({ containerPort: 5000 })).toBe("ws://127.0.0.1:5000/");
      expect(wsEndpointFor({ containerPort: null })).toBeUndefined();
    } finally {
      process.env.DOCKER_ENABLED = "false";
    }
  });
});

describe("health check job", () => {
  it("valid sessions are logged as healthy", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id);
    await createAccount(fx.workspace._id, { status: "disconnected" });
    const results = await runHealthChecks();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ valid: true, flagged: false });
    const ev = await AutomationEvent.findOne({ eventType: "health_check" });
    expect(ev?.payload).toMatchObject({ valid: true, refreshed: false });
    expect((await LinkedInAccount.findById(account._id))?.lastHealthCheck).toBeInstanceOf(Date);
  });

  it("expired sessions are refreshed via re-login", async () => {
    const fx = await createWorkspaceFixture();
    await createAccount(fx.workspace._id);
    verifyCookies.mockResolvedValueOnce({ valid: false }).mockResolvedValueOnce({ valid: true });
    const [r] = await runHealthChecks();
    expect(r.valid).toBe(true);
    expect(loginToLinkedIn).toHaveBeenCalledTimes(1);
    const ev = await AutomationEvent.findOne({ eventType: "health_check" });
    expect((ev?.payload as { refreshed?: boolean }).refreshed).toBe(true);
  });

  it("failed re-login flags the account and pauses its active campaigns", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id);
    const { list } = await createListWithLeads(fx.workspace._id, 1);
    const campaign = await createCampaign(fx.workspace._id, account._id, list._id, { status: "active" });
    verifyCookies.mockResolvedValueOnce({ valid: false });
    loginToLinkedIn.mockRejectedValueOnce(new Error("CHALLENGE_REQUIRED"));
    const [r] = await runHealthChecks();
    expect(r.flagged).toBe(true);
    expect((await LinkedInAccount.findById(account._id))?.status).toBe("flagged");
    expect((await Campaign.findById(campaign._id))?.status).toBe("paused");
    expect(await AutomationEvent.countDocuments({ eventType: "account_flagged" })).toBe(1);
  });

  it("a restricted account is flagged without attempting a re-login", async () => {
    const fx = await createWorkspaceFixture();
    const account = await createAccount(fx.workspace._id);
    verifyCookies.mockResolvedValueOnce({ valid: false, error: "ACCOUNT_RESTRICTED" });
    const [r] = await runHealthChecks();
    expect(r).toMatchObject({ valid: false, flagged: true });
    expect(loginToLinkedIn).not.toHaveBeenCalled();
    expect((await LinkedInAccount.findById(account._id))?.flagReason).toBe("ACCOUNT_RESTRICTED");
  });
});
