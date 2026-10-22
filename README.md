# Reachly

Reachly is a LinkedIn outreach workspace UI (demo/prototype). This repository implements the product shell and screens from the authoritative HTML reference in `design-reference/Reachly.html`.

## Stack

- **Next.js 15** (App Router)
- **TypeScript** (strict)
- **Tailwind CSS** + extracted reference stylesheet (`src/styles/reachly-reference.css`)
- **Chart.js** / react-chartjs-2 (charts from the reference)
- **Lucide React** (sidebar icons aligned with reference strokes)
- **Vitest** + React Testing Library
- **Supabase** (Auth + PostgreSQL with RLS)

## Prerequisites

- Node.js 20+
- npm
- Supabase project (for authentication — see `docs/SETUP.md`)

## Installation

```bash
cd Reachly
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (redirects to `/dashboard`).

Compare with the reference: open `design-reference/Reachly.html` in a browser at the same viewport width (~1280px desktop).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint (Next.js) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |

## Authentication (Task 003)

When `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set:

- Sign in / sign up / password reset at `/login`, `/signup`, etc.
- Protected app routes (middleware + session cookies via `@supabase/ssr`)
- Workspace bootstrap at `/workspace/setup` after first login

Without Supabase env vars, the app runs in **demo mode** (`/setup` for instructions). Dashboard data remains sample-only.

Apply database migrations: see `docs/SETUP.md`.

## Implementation status (UI)

**Implemented (UI demo):**

- App shell: sidebar, header/content layout, design tokens from reference CSS
- Routes: dashboard, campaigns, campaign detail, lead lists, LinkedIn accounts, Unibox, analytics, settings (7 panels), onboarding
- Modals: new campaign, connect account (no passwords), upload leads, lead list detail
- Preview toggle: populated vs empty states (sidebar control)
- Charts on dashboard, campaign detail, analytics
- Demo data under `src/data/demo/`

**Not implemented (by design for this milestone):**

- Authentication, database, billing, real LinkedIn integration, message sending, CSV import persistence

See `docs/ARCHITECTURE.md` and `docs/IMPLEMENTATION_PLAN.md`.

## Documentation

- `docs/DESIGN_REFERENCE_AUDIT.md` — reference inventory and route map
- `docs/PRD.md` — product vision
- `docs/ARCHITECTURE.md` — code structure
- `docs/SECURITY.md` — security principles
- `AGENTS.md` — conventions for AI/human contributors
