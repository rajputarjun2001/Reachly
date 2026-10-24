import { describe, expect, it } from "vitest";
import type { Model } from "mongoose";
import { useTestDb } from "./db";
import * as models from "../models";
import {
  AutomationEvent,
  Blacklist,
  Campaign,
  Conversation,
  InternalNote,
  Lead,
  LeadList,
  LinkedInAccount,
  User,
  Workspace,
  previewOf,
} from "../models";
import { decrypt, encrypt, isEncrypted } from "../utils/encryption";

useTestDb();

const MODELS: Record<string, Model<never>> = {
  AutomationEvent,
  Blacklist,
  Campaign,
  Conversation,
  InternalNote,
  Lead,
  LeadList,
  LinkedInAccount,
  User,
  Workspace,
} as unknown as Record<string, Model<never>>;

const indexKeys = async (model: Model<never>) =>
  (await model.collection.indexes()).map((i) => i.key as Record<string, number>);

describe("schemas and indexes", () => {
  it("the models module exports all ten models plus shared constants", () => {
    for (const name of Object.keys(MODELS)) {
      expect(name in models).toBe(true);
    }
    expect(models.LEAD_STATUSES).toContain("pending");
    expect(models.PLAN_DAILY_LIMIT).toEqual({ starter: 10, growth: 50 });
    expect(models.EVENT_TYPES).toContain("connection_sent");
    expect(typeof models.previewOf).toBe("function");
  });

  it("every tenant collection is indexed on workspaceId", async () => {
    for (const name of [
      "User",
      "LinkedInAccount",
      "LeadList",
      "Lead",
      "Campaign",
      "Conversation",
      "Blacklist",
      "AutomationEvent",
      "InternalNote",
    ]) {
      const keys = await indexKeys(MODELS[name]);
      expect(keys.some((k) => Object.keys(k)[0] === "workspaceId"), name).toBe(true);
    }
  });

  it("required compound indexes exist", async () => {
    expect(await indexKeys(MODELS.Lead)).toContainEqual({ listId: 1, status: 1 });
    expect(await indexKeys(MODELS.Conversation)).toContainEqual({ workspaceId: 1, hasUnread: 1 });
    expect(await indexKeys(MODELS.AutomationEvent)).toContainEqual({ workspaceId: 1, createdAt: 1 });
  });

  it("timestamps are enabled on all schemas", () => {
    for (const [name, model] of Object.entries(MODELS)) {
      expect(model.schema.get("timestamps"), name).toBe(true);
    }
  });

  it("workspace and lead defaults", async () => {
    const ws = await Workspace.create({ name: "W" });
    expect(ws.toObject()).toMatchObject({
      plan: "starter",
      dailyLimitPerAccount: 10,
      sendingWindowStart: 8,
      sendingWindowEnd: 20,
      sendOnWeekends: false,
      timezone: "UTC",
    });
    const lead = await Lead.create({ listId: ws._id, workspaceId: ws._id, linkedinUrl: "https://www.linkedin.com/in/x" });
    expect(lead.status).toBe("pending");
    expect(lead.source).toBe("csv_import");
    const list = await LeadList.create({ workspaceId: ws._id, name: "L" });
    expect(list.description).toBeNull();
  });

  it("campaign connection note is capped at 280 chars", async () => {
    const ws = await Workspace.create({ name: "W" });
    const c = new Campaign({
      workspaceId: ws._id,
      linkedinAccountId: ws._id,
      leadListId: ws._id,
      name: "C",
      connectionNote: "x".repeat(281),
    });
    await expect(c.validate()).rejects.toThrow();
  });

  it("campaign drafts may omit account and list; statuses and settings are validated", async () => {
    const ws = await Workspace.create({ name: "W" });
    const draft = await Campaign.create({
      workspaceId: ws._id,
      name: "Draft",
      description: "desc",
      connectionLabel: "Intro",
      messages: [{ step: 1, delayDays: 1, body: "hi", label: "First" }],
      settings: { goal: "meetings", timezone: "Asia/Kolkata", dailyLimit: 5 },
    });
    expect(draft.status).toBe("draft");
    expect(draft.linkedinAccountId).toBeNull();
    expect(draft.leadListId).toBeNull();
    expect(draft.messages[0].label).toBe("First");
    expect(draft.settings?.dailyLimit).toBe(5);

    for (const status of ["archived", "cancelled", "failed"]) {
      await expect(new Campaign({ workspaceId: ws._id, name: "S", status }).validate()).resolves.toBeUndefined();
    }
    await expect(new Campaign({ workspaceId: ws._id, name: "S", status: "bogus" }).validate()).rejects.toThrow();
    await expect(
      new Campaign({ workspaceId: ws._id, name: "S", settings: { dailyLimit: 0 } }).validate(),
    ).rejects.toThrow();
    await expect(
      new Campaign({
        workspaceId: ws._id,
        name: "S",
        messages: [
          { step: 1, delayDays: 1, body: "a" },
          { step: 1, delayDays: 2, body: "b" },
        ],
      }).validate(),
    ).rejects.toThrow("unique");
  });

  it("conversations support optional account, status and the system direction", async () => {
    const ws = await Workspace.create({ name: "W" });
    const conv = await Conversation.create({
      workspaceId: ws._id,
      title: "Manual thread",
      messages: [{ direction: "system", body: "created" }],
    });
    expect(conv.linkedinAccountId).toBeNull();
    expect(conv.status).toBe("open");
    expect(conv.lastMessagePreview).toBeNull();
    await expect(
      new Conversation({ workspaceId: ws._id, messages: [{ direction: "outbound", body: "x" }] }).validate(),
    ).rejects.toThrow();
    await expect(new Conversation({ workspaceId: ws._id, status: "deleted" }).validate()).rejects.toThrow();
    expect(previewOf("x".repeat(500))).toHaveLength(160);
    expect(previewOf("")).toBeNull();

    const note = await InternalNote.create({ workspaceId: ws._id, conversationId: conv._id, body: "remember" });
    expect(note.kind).toBe("note");
    await expect(new InternalNote({ workspaceId: ws._id, body: "" }).validate()).rejects.toThrow();
  });
});

describe("LinkedInAccount pre-save encryption", () => {
  it("encrypts plaintext passwords and leaves encrypted ones untouched", async () => {
    const ws = await Workspace.create({ name: "W" });
    const a = await LinkedInAccount.create({
      workspaceId: ws._id,
      linkedinEmail: "a@x.com",
      linkedinPasswordEncrypted: "plain-pass",
    });
    const stored = await LinkedInAccount.findById(a._id).select("+linkedinPasswordEncrypted");
    expect(isEncrypted(stored?.linkedinPasswordEncrypted)).toBe(true);
    expect(decrypt(stored!.linkedinPasswordEncrypted!)).toBe("plain-pass");

    const pre = encrypt("other");
    const b = await LinkedInAccount.create({ workspaceId: ws._id, linkedinEmail: "b@x.com", linkedinPasswordEncrypted: pre });
    const storedB = await LinkedInAccount.findById(b._id).select("+linkedinPasswordEncrypted");
    expect(storedB?.linkedinPasswordEncrypted).toBe(pre);
  });

  it("secrets are hidden from queries and JSON by default", async () => {
    const ws = await Workspace.create({ name: "W" });
    await LinkedInAccount.create({
      workspaceId: ws._id,
      linkedinEmail: "a@x.com",
      linkedinPasswordEncrypted: "p",
      sessionCookies: "enc",
      label: "Main",
    });
    const a = await LinkedInAccount.findOne({});
    expect(a?.linkedinPasswordEncrypted).toBeUndefined();
    expect(a?.label).toBe("Main");
    expect(a?.todaySentCount).toBe(0);
    expect(JSON.stringify(a)).not.toMatch(/sessionCookies|linkedinPassword/);
  });
});
