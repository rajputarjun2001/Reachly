# Reachly — Architecture

## Overview

One repository, one process. `server.ts` boots Next.js, mounts the Express app on `/api`, connects to MongoDB, and optionally starts BullMQ workers.

There is no separate backend repo and no Supabase. Next.js Server Actions call the same domain functions as the REST routes (`server/domain/*`). Both share Mongoose models in `server/models/`.

## Request paths

| Path | Access |
|------|--------|
| `/login`, `/signup`, `/forgot-password`, `/invite` | Public auth UI |
| `/auth/signout` | Clears the session cookie |
| `/setup` | Public — backend configuration status |
| `/workspace/setup` | Signed-in users who do not yet have a workspace |
| `/dashboard`, `/campaigns`, `/leads`, `/accounts`, `/unibox`, `/analytics`, `/settings` | Protected when env is configured |
| `/api/*` | Express REST API (JWT via `Authorization: Bearer` or, for the UI, the session cookie is used only on Server Actions) |

## Authentication

1. Sign-up / sign-in Server Actions call `server/domain/auth` and set an httpOnly cookie (`reachly_session`) signed with `jose`.
2. `src/middleware.ts` verifies that cookie on the edge (jose only — no Mongoose).
3. Pages re-load the user from MongoDB via `getCurrentUser()`.
4. REST routes use `server/middleware/auth.ts` and attach `{ userId, workspaceId, role }` to `req.user`.

Workspace id always comes from the session, never from a client-supplied id.

## Data

MongoDB collections (Mongoose, `timestamps: true`):

`users`, `workspaces`, `linkedinaccounts`, `leadlists`, `leads`, `campaigns`, `conversations`, `internalnotes`, `blacklists`, `automationevents`

Tenant isolation is `workspaceId` on every document plus application checks in `server/domain/context.ts`. This is not Postgres RLS.

## Domain modules

| Area | Next.js adapter | Domain |
|------|-----------------|--------|
| Auth / workspace | `src/app/(auth)/actions.ts` | `server/domain/auth.ts` |
| Leads | `src/lib/leads/repository.ts` | `server/domain/leads.ts` |
| Campaigns | `src/lib/campaigns/repository.ts` | `server/domain/campaigns.ts` |
| Accounts | `src/lib/accounts/repository.ts` | `server/domain/accounts.ts` |
| Unibox | `src/lib/unibox/repository.ts` | `server/domain/unibox.ts` |
| Insights | `src/lib/insights/repository.ts` | `server/domain/analytics.ts` |
| Settings / blacklist | REST `/api/settings`, `/api/blacklist` | `server/domain/settings.ts`, `blacklist.ts` |

The Settings screen still renders the reference UI with demo copy; the API and domain layer are implemented.

## Queues

BullMQ queues in `server/services/scheduler/`:

- `connection-queue` — daily connection requests
- `message-queue` — follow-up sequence
- `inbox-poll-queue` — inbox scrape every 2 hours per active account
- `maintenance-queue` — 07:55 UTC daily schedule, 30-minute health check, midnight send-count reset

Playwright lives in `server/services/playwright/linkedinActions.ts`. Session cookies and LinkedIn passwords are AES-256-GCM encrypted.

## Demo data

`src/data/demo/*` is preview mode only. Authenticated live routes load MongoDB.

## Implemented vs planned

| Capability | Status |
|------------|--------|
| UI from the HTML reference | Implemented |
| Email/password auth + workspace | Implemented (Mongo + JWT cookie) |
| Lead lists + CSV import | Implemented |
| Campaign configuration + launch | Implemented (BullMQ) |
| LinkedIn login / send / inbox poll | Implemented in code; selectors need a real-account pass |
| Settings page live UI | API exists; page still uses the demo layout |
| Billing | Not implemented |
