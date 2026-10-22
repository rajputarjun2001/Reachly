# Reachly — Architecture

## Overview

Single Next.js application (modular monolith). Server Components and middleware enforce authentication when Supabase is configured. Dashboard and campaigns remain demo-data driven; **leads and lead lists** persist per workspace when Supabase is configured and the user is signed in.

## Routing

| Path | Access |
|------|--------|
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Public (auth UI) |
| `/auth/callback` | OAuth / email confirm code exchange |
| `/auth/signout` | POST — clears session |
| `/setup` | Public — configuration status |
| `/workspace/setup` | Authenticated users without a workspace |
| `/dashboard`, `/campaigns`, … | Protected when Supabase configured |
| `/onboarding` | Legacy demo onboarding (unchanged UI) |

Route group `(app)` wraps `AppShell` + demo screens.

## Authentication flow

1. Browser uses `@supabase/ssr` `createBrowserClient` only on auth forms (anon key).
2. Middleware (`src/middleware.ts`) refreshes the session via `getUser()` and gates app routes; workspace membership is cached in an httpOnly cookie after the first check.
3. When configured, middleware redirects unauthenticated users away from app routes to `/login?next=…`.
4. Server Components use `createClient()` from `src/lib/supabase/server.ts` (cookie-backed).
5. No tokens in `localStorage`.

## Workspace resolution

- `getWorkspaceContext()` (`src/lib/workspace/context.ts`) loads the authenticated user and **first** `workspace_members` row (documented for future workspace switcher).
- Server actions and future APIs must not trust client-supplied `workspace_id` without membership checks.
- Initial workspace creation: RPC `create_initial_workspace` (idempotent, `SECURITY DEFINER`, fixed `search_path`).

## Database (Supabase PostgreSQL)

Tables: `profiles`, `workspaces`, `workspace_members`, `lead_lists`, `leads` — see `supabase/migrations/`.

RLS enabled on all tenant tables. Membership reads use `is_workspace_member()` / `workspace_role()` helpers to avoid policy recursion.

### Leads domain

- Server-only access: `src/lib/leads/repository.ts` (uses `requireWorkspaceContext()`).
- Server Actions: `src/app/(app)/leads/actions.ts` (CSV import, list CRUD, paginated lead reads).
- UI: `src/components/leads/leads-live-view.tsx` when authenticated + workspace; demo preview via `PreviewSwitch` otherwise.
- Cross-workspace list assignment blocked by composite FK `(lead_list_id, workspace_id)` and trigger `enforce_lead_workspace_from_list`.
- CSV import: client upload → Server Action → `parseLeadsCsv` → chunked RPC `import_leads_to_list` (transactional per chunk).

### Campaigns domain (configuration only)

- Tables: `campaigns`, `campaign_steps` — migration `20260222140000_campaigns_and_steps.sql`.
- Status lifecycle: `draft`, `active`, `paused`, `archived` (configuration/lifecycle — **no message sending**).
- Step types: `connection_request`, `message` with JSON `configuration` (`label`, `body_template`, `delay_days`).
- Server-only: `src/lib/campaigns/repository.ts`; actions: `src/app/(app)/campaigns/actions.ts`.
- UI: `campaigns-live-view.tsx`, `campaign-detail-live.tsx`, `campaign-wizard-modal.tsx` when Supabase + workspace; `force-dynamic` on `/campaigns` routes.
- Composite FK prevents cross-workspace lead list assignment.

## Demo data boundary

`src/data/demo/*` powers **dashboard** metrics and demo preview for unconfigured Supabase. Live leads and campaigns never read demo modules when authenticated.

## Implemented vs planned

| Capability | Status |
|------------|--------|
| Reference UI routes | Implemented |
| Supabase Auth (email/password) | Implemented |
| Workspace bootstrap + RLS | Implemented (apply migrations) |
| Lead lists + leads persistence | Implemented (migration `20260222130000_lead_lists_and_leads.sql`) |
| Campaign configuration persistence | Implemented (no execution/sending) |
| LinkedIn integration | Planned |
