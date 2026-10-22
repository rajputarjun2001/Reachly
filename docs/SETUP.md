# Reachly — Setup

## Prerequisites

- Node.js 20+
- npm (or pnpm — use the same package manager consistently)
- [Supabase CLI](https://supabase.com/docs/guides/cli) for local DB and migrations (optional but recommended)

## 1. Install dependencies

```bash
cd Reachly
npm install
```

## 2. Environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Set:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable (anon) key from Supabase **Project Settings → API** |
| `NEXT_PUBLIC_SITE_URL` | App URL for email links (e.g. `http://localhost:3000`) |

**Never** commit `.env.local` or put the **service role** key in the repo or in `NEXT_PUBLIC_*` variables.

If variables are missing, the app still starts: visit `/setup` for status. Authentication is disabled until configured.

## 3. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Under **Authentication → URL configuration**, add:
   - Site URL: `http://localhost:3000` (or your dev URL)
   - Redirect URLs: `http://localhost:3000/auth/callback`, `http://localhost:3000/reset-password`
3. Enable Email provider; configure email confirmation per your environment (on for production, optional locally).

## 4. Apply migrations

From the repo root (where `supabase/migrations` lives):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or local development:

```bash
supabase start
supabase db reset
```

Migration file: `supabase/migrations/20260222120000_initial_auth_workspace.sql`

## 5. Run the app

```bash
npm run dev
```

- Setup status: http://localhost:3000/setup  
- Sign in: http://localhost:3000/login  
- After first sign-in: http://localhost:3000/workspace/setup  

## 6. Tests

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

RLS integration tests (require local Supabase + `pgtap` if enabled):

```bash
supabase db test
```

See `supabase/tests/rls_policies.test.sql`.

## 7. Email (production)

Configure SMTP or Supabase Auth email templates for verification and password reset.
