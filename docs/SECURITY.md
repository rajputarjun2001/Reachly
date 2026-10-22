# Reachly — Security

## Implemented (Task 003)

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

- Row Level Security **enabled** on `profiles`, `workspaces`, `workspace_members`.
- No `USING (true)` policies on tenant data.
- Workspace creation only through `create_initial_workspace()` (`SECURITY DEFINER`, `search_path = public`).
- Users cannot insert arbitrary `workspace_members` rows via client policies.
- Profile rows scoped to `auth.uid()`.

### Workspace trust boundaries

- Server resolves workspace from membership, not from client IDs alone.
- Middleware requires workspace membership before app routes (when Supabase configured).

## Remaining risks / not yet implemented

- No rate limiting on auth endpoints (rely on Supabase / edge in production).
- RLS integration tests require local Supabase (`supabase db test`) — not run in CI unless configured.
- Demo UI still visible after login; data is not tenant-persisted campaigns/leads.
- Team invitations, audit logs, and billing are out of scope.

## Verification

```bash
npm test
supabase db push   # your project
supabase db test   # optional local RLS checks
```

Review migrations in `supabase/migrations/` before applying to production.
