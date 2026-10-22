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
3. Enable **Email** provider under Authentication → Providers.
4. **URL configuration** (required for sign-up links):
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/auth/callback`, `http://localhost:3000/reset-password`
5. **Local sign-up troubleshooting:** If sign-up fails with a confirmation/email error, either disable **Confirm email** on the Email provider (common for local dev) or configure SMTP. The sign-up form shows the Supabase error message in development.

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

Migrations (apply in order):

- `supabase/migrations/20260222120000_initial_auth_workspace.sql`
- `supabase/migrations/20260222130000_lead_lists_and_leads.sql`
- `supabase/migrations/20260222140000_campaigns_and_steps.sql`
- `supabase/migrations/20260222150000_unibox_conversations.sql`
- `supabase/migrations/20260222160000_unibox_internal_notes.sql`

After migrations, sign in and open **Leads** to import CSV lists. The Leads route is **server-rendered per request** (`force-dynamic`) so authenticated users never receive the static demo preview.

### CSV import (Leads page)

| Column | Required | Notes |
|--------|----------|--------|
| `linkedin_url` | Yes | Normalized URL; must be a `linkedin.com` profile URL |
| `first_name`, `last_name` | No | |
| `email` | No | Lowercased; invalid emails reject the row |
| `company` | No | |
| `title` / `job_title` | No | |

Limits: **2MB** file, **2000** data rows per import. Duplicates within the file are skipped; existing workspace leads with the same `linkedin_url` are skipped (not updated).

Run database policy smoke tests (local Supabase only):

```bash
supabase start
supabase db reset
supabase db test
```

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
