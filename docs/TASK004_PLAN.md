# Task 004 — Plan (pre-implementation)

## Foundation verification

- **Supabase CLI:** not installed on this machine — `supabase db push` / `supabase db test` **not run**. Migrations reviewed statically.
- **Task 003 schema:** `profiles`, `workspaces`, `workspace_members` + RLS helpers look sound; no `USING (true)` on tenant data.
- **Workspace context:** resolved server-side from `workspace_members` + `workspaces` (first membership); not from client input.
- **No critical defects found** requiring a blocking fix before lead tables.

## Planned schema

- `lead_lists` (workspace-scoped, `created_by`)
- `leads` (workspace-scoped, optional `lead_list_id` with composite FK `(lead_list_id, workspace_id) → lead_lists(id, workspace_id)`)
- Unique partial index on `(workspace_id, linkedin_url)` for duplicate detection
- RLS via existing `is_workspace_member` / `workspace_role`

## Import

- Max 2MB file, 2000 rows/import, chunks of 100
- Columns: `linkedin_url` (required), `first_name`, `last_name`, `email`, `company`, `title`/`job_title`
- Duplicates within file: skip; existing DB row same `linkedin_url` in workspace: skip
- Server action + optional `import_leads_to_list` RPC for atomic list creation + batch insert

## UI

- `/leads` loads real lists when Supabase configured + workspace context
- Demo cards only when unconfigured or preview empty mode (labeled)
- Upload modal wired to import action

## Completion status

- Migration `20260222130000_lead_lists_and_leads.sql` added with RLS, composite FK, import RPC.
- Server repository + Server Actions + live Leads UI implemented.
- **Verification:** `npm test` (15), `typecheck`, `lint`, `build` — all passed on dev machine.
- **Not verified:** live RLS / cross-tenant tests (`supabase db test`) — Supabase CLI not available in agent environment.
