# Reachly

Reachly is a LinkedIn outreach workspace. This repository is a **single-process monolith**: the Next.js UI, the Express REST API, and background workers live together and share one MongoDB database.

The visual source of truth is `design-reference/Reachly.html`.

## Stack

| Layer | Choice |
|-------|--------|
| UI | Next.js 15 (App Router) + TypeScript + Tailwind + reference CSS |
| API | Express, mounted at `/api` by the custom server (`server.ts`) |
| Database | MongoDB (Mongoose) |
| Queue | BullMQ + Redis |
| Auth | JWT in an httpOnly cookie (`reachly_session`) |
| Automation | Playwright (Chromium). Optional Docker isolation per LinkedIn account |

Supabase is not used.

## Prerequisites

- Node.js 22.12+
- npm
- Docker Desktop (for local MongoDB + Redis via `npm run services:up`)

## Installation

```bash
cd Reachly
npm install
cp .env.example .env
# Generate secrets:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # JWT_SECRET
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
npm run services:up
npm run browsers:install   # one-time Chromium download for Playwright
```

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The same process serves `/api/*`.

Without `MONGO_URI`, `JWT_SECRET`, and `ENCRYPTION_KEY`, the UI runs in **demo / preview mode** (`/setup` explains what is missing).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Custom server: Next.js + `/api` + workers |
| `npm run build` | Next.js production build, compile `server.ts`, install Playwright Chromium |
| `npm run start` | Production server (`dist/server.js`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` for the app and the server |
| `npm test` | Vitest (UI + server) |
| `npm run services:up` | Start MongoDB and Redis |
| `npm run services:down` | Stop those containers |
| `npm run browsers:install` | Download Playwright Chromium |

## What is live vs preview

When the backend env is set and you are signed in:

- Auth, workspace, lead lists, CSV import, campaigns, LinkedIn accounts, Unibox, and analytics read and write MongoDB through `server/domain/*`.
- Campaign launch queues BullMQ jobs. Workers send via Playwright when Redis is up.

The sidebar **preview toggle** still shows sample data from `src/data/demo/` so the reference UI can be compared without a database.

## Documentation

- `docs/SETUP.md` — local install
- `docs/ARCHITECTURE.md` — how the monolith is wired
- `docs/PRODUCTION.md` — modules 5–10 checklist and deploy steps
- `docs/CAMPAIGN_EXECUTION.md` — BullMQ queues and campaign lifecycle
- `docs/SECURITY.md` — secrets, sessions, LinkedIn credentials
- `AGENTS.md` — conventions for contributors
