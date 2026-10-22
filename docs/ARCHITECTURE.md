# Reachly — Architecture

## Overview

Single Next.js application (modular monolith). Server Components and middleware enforce authentication when Supabase is configured. Product UI remains demo-data driven until later milestones persist domain data.

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
2. Middleware (`src/middleware.ts`) refreshes session cookies via `updateSession`.
3. When configured, middleware redirects unauthenticated users away from app routes to `/login?next=…`.
4. Server Components use `createClient()` from `src/lib/supabase/server.ts` (cookie-backed).
5. No tokens in `localStorage`.

## Workspace resolution

- `getWorkspaceContext()` (`src/lib/workspace/context.ts`) loads the authenticated user and **first** `workspace_members` row (documented for future workspace switcher).
- Server actions and future APIs must not trust client-supplied `workspace_id` without membership checks.
- Initial workspace creation: RPC `create_initial_workspace` (idempotent, `SECURITY DEFINER`, fixed `search_path`).

## Database (Supabase PostgreSQL)

Tables: `profiles`, `workspaces`, `workspace_members` — see migration SQL.

RLS enabled on all three. Membership reads use `is_workspace_member()` / `workspace_role()` helpers to avoid policy recursion.

## Demo data boundary

`src/data/demo/*` powers dashboard/campaigns UI. Banners state clearly that metrics are **not** persisted customer data. Authenticated workspace records are separate and not merged into demo tables in this milestone.

## Implemented vs planned

| Capability | Status |
|------------|--------|
| Reference UI routes | Implemented |
| Supabase Auth (email/password) | Implemented |
| Workspace bootstrap + RLS | Implemented (apply migrations) |
| Campaign/lead persistence | Planned |
| LinkedIn integration | Planned |
