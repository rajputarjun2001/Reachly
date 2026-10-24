import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "./db";
import { app, createAccount, createCampaign, createListWithLeads, createWorkspaceFixture, request } from "./factory";
import { AutomationEvent, Conversation, InternalNote, LinkedInAccount } from "../models";
import * as li from "../services/playwright/linkedinActions";
import * as unibox from "../domain/unibox";

vi.mock("../services/scheduler/queues");
vi.mock("../services/playwright/linkedinActions");

useTestDb();

const sendMessage = vi.mocked(li.sendMessage);

beforeEach(() => {
  vi.clearAllMocks();
});

async function setup() {
  const fx = await createWorkspaceFixture();
  const account = await createAccount(fx.workspace._id, { fullName: "Sender" });
  const { list, leads } = await createListWithLeads(fx.workspace._id, 3);
  const campaign = await createCampaign(fx.workspace._id, account._id, list._id, { name: "Camp" });
  const base = { workspaceId: fx.workspace._id, linkedinAccountId: account._id, campaignId: campaign._id };
  const convos = await Conversation.create([
    {
      ...base,
      leadId: leads[0]._id,
      title: "First0 Last0",
      hasUnread: true,
      lastMessageAt: new Date(Date.now() - 1000),
      lastMessagePreview: "b",
      messages: [
        { direction: "sent", body: "a" },
        { direction: "received", body: "b" },
      ],
    },
    {
      ...base,
      leadId: leads[1]._id,
      title: "First1 Last1",
      hasUnread: false,
      lastMessageAt: new Date(),
      lastMessagePreview: "c",
      messages: [{ direction: "sent", body: "c" }],
    },
    {
      ...base,
      leadId: leads[2]._id,
      title: "First2 Last2",
      hasUnread: false,
      status: "archived",
      lastMessageAt: new Date(Date.now() - 5000),
      lastMessagePreview: "pricing question",
      messages: [{ direction: "received", body: "pricing question" }],
    },
  ]);
  return { ...fx, account, leads, campaign, convos };
}

describe("GET /api/unibox/conversations", () => {
  it("sorts by lastMessageAt desc, populates names and filters", async () => {
    const s = await setup();
    const all = await request(app).get("/api/unibox/conversations").set(s.auth);
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBe(3);
    const ids = all.body.data.conversations.map((c: { _id: string }) => c._id);
    expect(ids).toEqual([s.convos[1], s.convos[0], s.convos[2]].map((c) => String(c._id)));
    const first = all.body.data.conversations[1];
    expect(first.leadId).toMatchObject({ firstName: "First0", company: "Acme" });
    expect(first.campaignId.name).toBe("Camp");
    expect(first.linkedinAccountId.fullName).toBe("Sender");
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].body).toBe("b");

    const unread = await request(app).get("/api/unibox/conversations?filter=unread").set(s.auth);
    expect(unread.body.data.total).toBe(1);
    const replied = await request(app).get("/api/unibox/conversations?filter=replied").set(s.auth);
    expect(replied.body.data.total).toBe(2);
    expect((await request(app).get("/api/unibox/conversations?filter=nope").set(s.auth)).status).toBe(400);
    const paged = await request(app).get("/api/unibox/conversations?limit=2&page=2").set(s.auth);
    expect(paged.body.data.conversations).toHaveLength(1);
  });

  it("the domain filters by status and searches title / preview", async () => {
    const s = await setup();
    expect((await unibox.listConversations(s.ctx, { status: "archived" })).total).toBe(1);
    expect((await unibox.listConversations(s.ctx, { status: "open" })).total).toBe(2);
    expect((await unibox.listConversations(s.ctx, { status: "all" })).total).toBe(3);
    expect((await unibox.listConversations(s.ctx, { search: "PRICING" })).total).toBe(1);
    expect((await unibox.listConversations(s.ctx, { search: "first1" })).total).toBe(1);
    expect((await unibox.listConversations(s.ctx, { search: "(" })).total).toBe(0);
  });

  it("is scoped to the workspace", async () => {
    const s = await setup();
    const other = await createWorkspaceFixture();
    const res = await request(app).get("/api/unibox/conversations").set(other.auth);
    expect(res.body.data.total).toBe(0);
    expect((await request(app).get(`/api/unibox/conversations/${s.convos[0]._id}`).set(other.auth)).status).toBe(404);
    expect((await request(app).patch(`/api/unibox/conversations/${s.convos[0]._id}/read`).set(other.auth)).status).toBe(404);
  });
});

describe("conversation detail, read and reply", () => {
  it("detail returns all messages; read clears hasUnread", async () => {
    const s = await setup();
    const detail = await request(app).get(`/api/unibox/conversations/${s.convos[0]._id}`).set(s.auth);
    expect(detail.body.data.messages).toHaveLength(2);
    expect(detail.body.data.leadId.firstName).toBe("First0");
    const read = await request(app).patch(`/api/unibox/conversations/${s.convos[0]._id}/read`).set(s.auth);
    expect(read.body.data.hasUnread).toBe(false);
    expect((await Conversation.findById(s.convos[0]._id))?.hasUnread).toBe(false);
  });

  it("reply sends via LinkedIn, appends the message and logs msg_sent_manual", async () => {
    const s = await setup();
    const res = await request(app)
      .post(`/api/unibox/conversations/${s.convos[0]._id}/reply`)
      .set(s.auth)
      .send({ message: "Great, Tuesday?" });
    expect(res.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith(expect.any(Array), s.leads[0].linkedinUrl, "Great, Tuesday?", expect.any(Object));
    const convo = await Conversation.findById(s.convos[0]._id);
    expect(convo?.messages.at(-1)).toMatchObject({ direction: "sent", body: "Great, Tuesday?" });
    expect(convo?.lastMessagePreview).toBe("Great, Tuesday?");
    expect(convo?.hasUnread).toBe(false);
    expect(await AutomationEvent.countDocuments({ eventType: "msg_sent_manual" })).toBe(1);
  });

  it("reply validation and failure handling", async () => {
    const s = await setup();
    const url = `/api/unibox/conversations/${s.convos[0]._id}/reply`;
    expect((await request(app).post(url).set(s.auth).send({})).status).toBe(400);
    expect((await request(app).post(url).set(s.auth).send({ message: "x".repeat(8001) })).status).toBe(400);

    sendMessage.mockResolvedValueOnce({ success: false, error: "MESSAGE_UNAVAILABLE" });
    expect((await request(app).post(url).set(s.auth).send({ message: "x" })).status).toBe(502);

    await LinkedInAccount.updateOne({ _id: s.account._id }, { status: "flagged" });
    expect((await request(app).post(url).set(s.auth).send({ message: "x" })).status).toBe(422);
    expect((await Conversation.findById(s.convos[0]._id))?.messages).toHaveLength(2);
  });

  it("replying to a manual conversation without an account or lead is a 422", async () => {
    const s = await setup();
    const manual = await unibox.createConversation(s.ctx, { title: "Phone call" });
    expect((await request(app).post(`/api/unibox/conversations/${manual._id}/reply`).set(s.auth).send({ message: "hi" })).status).toBe(422);
    const withLead = await unibox.createConversation(s.ctx, { leadId: String(s.leads[0]._id) });
    await expect(unibox.reply(s.ctx, String(withLead._id), "hi")).rejects.toThrow(/no LinkedIn account/);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("manual conversations, local messages and status", () => {
  it("createConversation needs a title or a workspace lead", async () => {
    const s = await setup();
    const other = await createWorkspaceFixture();
    const fromLead = await unibox.createConversation(s.ctx, { leadId: String(s.leads[1]._id) });
    expect(fromLead.toObject()).toMatchObject({ title: "First1 Last1", participantName: "First1 Last1", status: "open" });
    expect(fromLead.linkedinAccountId).toBeNull();
    const titled = await unibox.createConversation(s.ctx, { title: "  Intro call " });
    expect(titled.title).toBe("Intro call");
    await expect(unibox.createConversation(s.ctx, {})).rejects.toMatchObject({ status: 400 });
    await expect(unibox.createConversation(other.ctx, { leadId: String(s.leads[1]._id) })).rejects.toMatchObject({ status: 404 });
  });

  it("addLocalMessage records sent / received / system messages without calling LinkedIn", async () => {
    const s = await setup();
    const convo = await unibox.createConversation(s.ctx, { title: "Log" });
    await unibox.addLocalMessage(s.ctx, String(convo._id), { direction: "system", body: "Called, left voicemail" });
    const updated = await unibox.addLocalMessage(s.ctx, String(convo._id), { direction: "received", body: " ok " });
    expect(updated.messages.map((m) => [m.direction, m.body])).toEqual([
      ["system", "Called, left voicemail"],
      ["received", "ok"],
    ]);
    expect(updated.lastMessagePreview).toBe("ok");
    expect(updated.lastMessageAt).toBeInstanceOf(Date);
    await expect(unibox.addLocalMessage(s.ctx, String(convo._id), { direction: "sent", body: "  " })).rejects.toMatchObject({
      status: 400,
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("setConversationStatus archives and re-opens", async () => {
    const s = await setup();
    const id = String(s.convos[0]._id);
    expect((await unibox.setConversationStatus(s.ctx, id, "archived")).status).toBe("archived");
    expect((await unibox.setConversationStatus(s.ctx, id, "open")).status).toBe("open");
    await expect(unibox.setConversationStatus(s.ctx, id, "deleted" as "open")).rejects.toMatchObject({ status: 400 });
  });
});

describe("internal notes", () => {
  it("create, list, update and delete notes scoped to the workspace", async () => {
    const s = await setup();
    const other = await createWorkspaceFixture();
    const convoId = String(s.convos[0]._id);
    const leadId = String(s.leads[0]._id);

    const onConvo = await unibox.createNote(s.ctx, { conversationId: convoId, body: " Follow up Friday " });
    expect(onConvo.toObject()).toMatchObject({ body: "Follow up Friday", kind: "note" });
    expect(String(onConvo.createdBy)).toBe(s.ctx.userId);
    const draft = await unibox.createNote(s.ctx, { leadId, kind: "draft", body: "Draft reply" });
    expect(draft.kind).toBe("draft");
    await unibox.createNote(s.ctx, { leadId: String(s.leads[1]._id), body: "unrelated" });

    const notes = await unibox.listNotes(s.ctx, { leadId, conversationId: convoId });
    expect(notes.map((n) => n.body).sort()).toEqual(["Draft reply", "Follow up Friday"]);
    expect(await unibox.listNotes(s.ctx, {})).toEqual([]);
    expect(await unibox.listNotes(other.ctx, { leadId })).toEqual([]);

    await expect(unibox.createNote(s.ctx, { body: "orphan" })).rejects.toMatchObject({ status: 400 });
    await expect(unibox.createNote(s.ctx, { leadId, body: "" })).rejects.toMatchObject({ status: 400 });
    await expect(unibox.createNote(other.ctx, { conversationId: convoId, body: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(unibox.createNote(other.ctx, { leadId, body: "x" })).rejects.toMatchObject({ status: 404 });

    expect((await unibox.updateNote(s.ctx, String(onConvo._id), "Edited")).body).toBe("Edited");
    await expect(unibox.updateNote(other.ctx, String(onConvo._id), "Hijack")).rejects.toMatchObject({ status: 404 });
    await expect(unibox.deleteNote(other.ctx, String(onConvo._id))).rejects.toMatchObject({ status: 404 });
    await unibox.deleteNote(s.ctx, String(onConvo._id));
    expect(await InternalNote.countDocuments({ workspaceId: s.workspace._id })).toBe(2);
  });
});
