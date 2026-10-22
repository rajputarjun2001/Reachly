import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("supabase migrations", () => {
  it("enables RLS and defines bootstrap RPC", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260222120000_initial_auth_workspace.sql"),
      "utf8",
    );
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/create_initial_workspace/);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("defines lead tables with workspace isolation", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260222130000_lead_lists_and_leads.sql"),
      "utf8",
    );
    expect(sql).toMatch(/create table public\.lead_lists/i);
    expect(sql).toMatch(/create table public\.leads/i);
    expect(sql).toMatch(/leads_lead_list_workspace_fk/i);
    expect(sql).toMatch(/enforce_lead_workspace_from_list/i);
    expect(sql).toMatch(/import_leads_to_list/i);
    expect(sql).toMatch(/is_workspace_member\(workspace_id\)/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("defines campaigns with workspace isolation", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260222140000_campaigns_and_steps.sql"),
      "utf8",
    );
    expect(sql).toMatch(/create table public\.campaigns/i);
    expect(sql).toMatch(/campaigns_lead_list_workspace_fk/i);
    expect(sql).toMatch(/campaign_steps_campaign_workspace_fk/i);
    expect(sql).toMatch(/is_workspace_member\(workspace_id\)/i);
  });

  it("defines unibox tables with workspace isolation", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260222150000_unibox_conversations.sql"),
      "utf8",
    );
    expect(sql).toMatch(/create table public\.conversations/i);
    expect(sql).toMatch(/create table public\.messages/i);
    expect(sql).toMatch(/messages_conversation_workspace_fk/i);
    expect(sql).toMatch(/conversations_lead_workspace_fk/i);
    expect(sql).toMatch(/leads_id_workspace_uidx/i);
  });

  it("defines unibox internal notes separate from messages", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260222160000_unibox_internal_notes.sql"),
      "utf8",
    );
    expect(sql).toMatch(/create table public\.unibox_internal_notes/i);
    expect(sql).toMatch(/kind text not null default 'note'/i);
    expect(sql).toMatch(/unibox_internal_notes_conversation_workspace_fk/i);
    expect(sql).toMatch(/is_workspace_member\(workspace_id\)/i);
    expect(sql).not.toMatch(/direction/i);
    expect(sql).not.toMatch(/sent_at/i);
  });
});
