# Reachly — Security

## Implemented (Task 003–004)

### Authentication

- Supabase Auth with **HTTP-only cookie sessions** via `@supabase/ssr` (no custom token storage in `localStorage`).
- Middleware refreshes sessions and redirects unauthenticated users from app routes when Supabase is configured.
- Generic error messages on sign-in/sign-up to avoid email enumeration where practical.
- Password reset and sign-up validated server-side in Server Actions.
- `getSafeRedirectPath()` blocks open redirects (`//`, `https://`, auth loops).

### Secrets

- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the client bundle.
- **Service role key is not used** in this app and must never be exposed to the browser.
- `.env.local` is gitignored; `.env.example` has placeholders only.

### Database

- Row Level Security **enabled** on `profiles`, `workspaces`, `workspace_members`, `lead_lists`, `leads`, `campaigns`, `campaign_steps`, `conversations`, `messages`, `unibox_internal_notes`.
- No `USING (true)` policies on tenant data.
- Workspace creation only through `create_initial_workspace()` (`SECURITY DEFINER`, `search_path = public`).
- Users cannot insert arbitrary `workspace_members` rows via client policies.
- Profile rows scoped to `auth.uid()`.

### Workspace trust boundaries

- Server resolves workspace from membership, not from client IDs alone.
- Middleware requires workspace membership before app routes (when Supabase configured).
- Lead writes never accept client `workspace_id`; repository uses membership-derived workspace.
- Leads cannot reference a list in another workspace (composite FK + trigger).

### Unibox

- RLS on `conversations`, `messages`, and `unibox_internal_notes`; composite FKs prevent cross-workspace threads and mismatched lead/conversation pairs (DB trigger `enforce_unibox_internal_note_parents`).
- Thread `messages` represent inbound/outbound/system conversation history only. Internal notes/drafts live in `unibox_internal_notes` and must never be inserted into `messages` as if sent.
- Body max 8000 chars for messages and internal notes; do not log message or note content in application logs.
- Delete on conversations/messages restricted to owner/admin; workspace members may delete their workspace internal notes via RLS member policy.

### Campaigns (configuration only)

- Campaigns and steps are workspace-scoped; `lead_list_id` uses composite FK with `lead_lists`.
- `campaign_steps` must match parent campaign `workspace_id` (trigger + FK).
- Campaign delete restricted to `owner` / `admin` (same pattern as lead list delete).
- **Active** status does not start outreach — no workers or external APIs in this release.

### Leads and CSV import

- Duplicate strategy: skip rows whose `linkedin_url` already exists in the workspace (unique index on `(workspace_id, lower(linkedin_url))`); skip duplicate URLs within the same CSV file.
- Import limits: 2MB file size, 2000 data rows, inserts chunked at 100 rows per RPC call.
- `import_leads_to_list` is `SECURITY DEFINER` with `search_path = public` and checks `auth.uid()` + `is_workspace_member` before inserting — not granted to `anon`.
- Lead list delete restricted to `owner` / `admin` roles via RLS.

## Remaining risks / not yet implemented

- No rate limiting on auth endpoints (rely on Supabase / edge in production).
- RLS integration tests require local Supabase (`supabase db test`) — **not executed** in this environment unless CLI is installed and `supabase start` is running.
- Migration SQL is statically tested in `src/lib/db/migrations.test.ts`; live RLS behavior is unverified until database tests run.
- Dashboard/analytics use aggregated counts; time-series queries cap sampled rows (`LEAD_SAMPLE_CAP` in insights repository).
- Team invitations, audit logs, and billing are out of scope.

## Verification

```bash
npm test
supabase db push   # your project
supabase db test   # optional local RLS checks
```

Review migrations in `supabase/migrations/` before applying to production.
