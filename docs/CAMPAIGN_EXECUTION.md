# Campaign execution (BullMQ + Playwright)

Reachly runs outreach in-process with **BullMQ** queues backed by **Redis**. Campaign configuration lives in MongoDB (`Campaign`, `Lead`). Workers in `server/services/scheduler/` perform real LinkedIn actions via **Playwright** (not console-only stubs).

## Queues

| Queue | Worker | Purpose |
|-------|--------|---------|
| `reachly:connection` | `connectionProcessor` | Send connection requests |
| `reachly:message` | `messageProcessor` | Send follow-up DMs |
| `reachly:inbox-poll` | `inboxProcessor` | Scrape messaging inbox every **2 hours** per active account |
| `reachly:maintenance` | `maintenanceProcessor` | Hourly daily schedule + 30‑min account health checks |

Job names and payloads: `server/services/scheduler/jobTypes.ts`.

## Lifecycle

1. **Launch** (`domain/campaigns.launchCampaign`) sets status `active`, then `scheduleDailyConnections` enqueues connection jobs with random delays inside the sending window.
2. **Hourly cron** (`maintenance` → `daily-schedule` → `startAllActiveCampaigns`) re-runs scheduling idempotently per local calendar day (`lastScheduledFor`).
3. **Connection worker** reserves a daily slot, calls `linkedinActions.sendConnectionRequest`, updates lead status and `AutomationEvent` logs.
4. **Inbox poll** matches threads to leads, stores messages in `Conversation`, marks `replied`, and runs `checkAcceptances` for pending invitations.
5. **Message worker** sends configured steps after `connected` / prior message statuses.

Pause/cancel stops new work: processors skip when `campaign.status !== "active"`.

## Requirements

- `MONGO_URI`, `JWT_SECRET`, `ENCRYPTION_KEY` — app and API
- `REDIS_HOST` / `REDIS_PORT` — required when `WORKERS_ENABLED=true` (default)
- `npm run browsers:install` — Chromium for Playwright on the host (or `DOCKER_ENABLED=true` for per-account browser containers)

There is **no** `CAMPAIGN_EXECUTOR_MOCK` or console-only executor in this codebase. Tests mock Playwright and queues with Vitest.

## Operations

- On startup, `server.ts` starts workers and runs `startAllActiveCampaigns()` once.
- `/api/health` reports Mongo and Redis when the backend is configured.
- In **production**, if workers are enabled and fail to start (usually Redis down), the process exits.

See `docs/PRODUCTION.md` for the full deployment checklist.
