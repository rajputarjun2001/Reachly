# Task 003 — Implementation plan (repository-based)

## Current state

- Next.js 15 App Router; app routes under `src/app/(app)/` with `AppShell` + demo data in `src/data/demo/`.
- No Supabase packages or migrations yet.
- Onboarding at `/onboarding` is UI-only (demo); product onboarding moves to `/workspace/setup` after auth.

## Approach

1. Add `@supabase/supabase-js` + `@supabase/ssr` with cookie-based sessions (no localStorage tokens).
2. `supabase/migrations/` — profiles, workspaces, workspace_members, RLS, bootstrap RPC.
3. `src/lib/env.ts` — validate public Supabase URL/anon key; app runs without them with honest setup UI.
4. `src/middleware.ts` — refresh session; when configured, protect `(app)` routes server-side.
5. Auth routes `(auth)/login|signup|forgot-password|reset-password` + `auth/callback`.
6. `(app)/layout.tsx` — require user + workspace when Supabase configured; else demo banner.
7. `src/lib/workspace/` — server-side resolver (first membership); never trust client workspace id.
8. Tests for env, redirects, bootstrap SQL file presence; RLS integration documented for `supabase test`.

## Out of scope (this task)

Campaign DB, leads, LinkedIn, billing, invitations.
