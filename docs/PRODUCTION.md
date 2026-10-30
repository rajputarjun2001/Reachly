# Production readiness

Use this checklist before shipping. All items below are implemented in `Reachly/` and covered by Vitest suites under `server/test/`.

## Modules 5–10

| Module | Status | Implementation | Tests |
|--------|--------|----------------|-------|
| **5 — Campaign launch & BullMQ** | Ready | `launchCampaign` → `connectionQueue` / `messageQueue`; workers in `server.ts`; hourly `daily-schedule` | `campaigns.test.ts`, `scheduler.test.ts`, `processors.test.ts` |
| **6 — LinkedIn login & encrypted cookies** | Ready | `linkedinActions.loginToLinkedIn` + `encrypt` / `encryptJSON` on password and cookies | `accounts.test.ts`, `linkedinActions.test.ts`, `utils.test.ts` |
| **7 — Connection requests & statuses** | Ready | `connectionProcessor` + Playwright; acceptance via `acceptanceChecker` | `processors.test.ts`, `inbox.test.ts` |
| **8 — Inbox poll every 2h** | Ready | `INBOX_POLL_EVERY_MS` = 2h; `ensureInboxPoll` on connect/launch; `inboxProcessor` | `inbox.test.ts`, `campaigns.test.ts` |
| **9 — Analytics** | Ready | `server/domain/analytics.ts` + UI via `src/lib/insights/repository.ts` | `analytics.test.ts`, `aggregations.test.ts` |
| **10 — Blacklist & settings** | Ready | REST + `server/domain/*`; Settings UI (`settings-live-view`) for profile, workspace, members, blacklist | `blacklistSettings.test.ts` |

Billing, integrations, and safety panels in Settings remain **preview-only** UI.

## Deploy steps

1. Provision **MongoDB** and **Redis** (managed or self-hosted).
2. Set env from `.env.example` (secrets via your secret manager).
3. `npm ci && npm run build` (the build script runs `npm run browsers:install` for Playwright Chromium)
4. `NODE_ENV=production npm run start` (or run `dist/server.js` under a process manager).
5. Point load balancer health checks at `GET /api/health` (expect `200` when Mongo + Redis are up).

## Production env

| Variable | Notes |
|----------|--------|
| `WORKERS_ENABLED` | Keep `true` on the worker-capable instance. Set `false` only if you run a separate worker process (same code, workers import). |
| `DOCKER_ENABLED` | Optional; isolates browsers per LinkedIn account. Requires Docker on the host. |
| `NEXT_PUBLIC_SITE_URL` | Must match the public HTTPS origin (cookies, invite links). |

## LinkedIn automation risks

Playwright against LinkedIn violates their ToS if used for bulk automation. Operate within your legal/compliance constraints; use conservative daily limits and monitor `flagged` account status.

## Render (and similar PaaS)

Use a **Web Service** with enough RAM for Chromium (recommend **≥ 1 GB**; 512 MB often OOMs on launch).

| Setting | Value |
|---------|--------|
| Build command | `npm ci && npm run build` |
| Start command | `npm run start` |
| Environment | `PLAYWRIGHT_BROWSERS_PATH=0` (optional; server defaults to this) |

Chromium is installed into `node_modules` during `npm run build`, not Render’s `/opt/render/.cache/ms-playwright/` cache (that path is often empty at runtime). If logs still say `Executable doesn't exist`, confirm the build log includes Playwright downloading Chromium. Do **not** set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`.

On Linux hosts, if Chromium downloads but fails to start with missing shared libraries, run `npx playwright install-deps chromium` in the build step (requires a image/OS that allows it) or deploy with `DOCKER_ENABLED=true` and Docker available on the host.

## Verify locally

```bash
npm run services:up
npm test
npm run build
npm run dev
curl http://localhost:3000/api/health
```

Sign up, connect a LinkedIn account (test account), import leads, launch a campaign, and confirm jobs in Redis (`redis-cli KEYS 'bull:*'`).
