import request from "supertest";
import type { Types } from "mongoose";
import { createApiApp } from "../app";
import { Campaign, Lead, LeadList, LinkedInAccount, User, Workspace } from "../models";
import { signSession } from "../auth/token";
import { encrypt, encryptJSON } from "../utils/encryption";
import type { AuthContext } from "../domain/context";
import type { JobLike } from "../services/scheduler/jobTypes";

export const app = createApiApp();
export { request };

type Id = Types.ObjectId | string;
const rand = () => Math.random().toString(36).slice(2, 8);

/** Registers through the REST API (account + workspace). */
export async function registerUser(overrides: Record<string, unknown> = {}) {
  const body = {
    email: `user${rand()}@example.com`,
    password: "password123",
    fullName: "Test User",
    workspaceName: "Test Workspace",
    ...overrides,
  };
  const res = await request(app).post("/api/auth/register").send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    ...res.body.data,
    password: body.password,
    auth: { Authorization: `Bearer ${res.body.data.token}` },
  } as {
    token: string;
    user: { _id: string; email: string; workspaceId: string; role: string };
    workspace: { _id: string; name: string };
    password: string;
    auth: { Authorization: string };
  };
}

export async function createWorkspaceFixture(workspaceOverrides: Record<string, unknown> = {}) {
  const workspace = await Workspace.create({ name: "WS", ...workspaceOverrides });
  const user = await User.create({ email: `owner${rand()}${Date.now()}@ex.com`, workspaceId: workspace._id, role: "owner" });
  workspace.ownerId = user._id;
  await workspace.save();
  const ctx: AuthContext = { userId: String(user._id), workspaceId: String(workspace._id), role: "owner" };
  const token = await signSession(ctx);
  return { workspace, user, ctx, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createAccount(workspaceId: Id, overrides: Record<string, unknown> = {}) {
  return LinkedInAccount.create({
    workspaceId,
    linkedinEmail: `li${rand()}@example.com`,
    linkedinPasswordEncrypted: encrypt("li-password"),
    sessionCookies: encryptJSON([
      { name: "li_at", value: "cookie", domain: ".linkedin.com", path: "/" },
      { name: "JSESSIONID", value: "js", domain: ".linkedin.com", path: "/" },
    ]),
    status: "active",
    ...overrides,
  });
}

export async function createListWithLeads(workspaceId: Id, count = 3, leadOverrides: Record<string, unknown> = {}) {
  const list = await LeadList.create({ workspaceId, name: "List" });
  const leads = [];
  for (let i = 0; i < count; i += 1) {
    leads.push(
      await Lead.create({
        listId: list._id,
        workspaceId,
        linkedinUrl: `https://www.linkedin.com/in/lead-${i}-${rand()}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        company: "Acme",
        ...leadOverrides,
      }),
    );
  }
  list.totalLeads = count;
  await list.save();
  return { list, leads };
}

export async function createCampaign(workspaceId: Id, accountId: Id | null, listId: Id | null, overrides: Record<string, unknown> = {}) {
  return Campaign.create({
    workspaceId,
    linkedinAccountId: accountId,
    leadListId: listId,
    name: "Campaign",
    status: "active",
    connectionNote: "Hi {{firstName}}, let us connect",
    messages: [
      { step: 1, delayDays: 1, body: "Thanks {{firstName}}!" },
      { step: 2, delayDays: 3, body: "Following up" },
    ],
    ...overrides,
  });
}

export const job = <T>(data: T, opts: { attempts?: number } = { attempts: 2 }, attemptsMade = 0, name = "job"): JobLike<T> => ({
  data,
  opts,
  attemptsMade,
  name,
});
