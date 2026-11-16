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

**Recommended connect paths on cloud hosts:**

1. **Sign In with LinkedIn (OIDC)** — set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`; add redirect URL `{NEXT_PUBLIC_SITE_URL}/auth/linkedin/callback` in the LinkedIn Developer Portal. OIDC verifies identity only; after redirect, paste **session cookies** to enable outreach.
2. **Paste session cookies** — sign in at linkedin.com in your browser, copy `li_at` (+ `JSESSIONID`) from DevTools, connect in Add Account.

**Password login:** Reachly signs in from the server, so LinkedIn sees a new device at the server's (or the account proxy's) address. Expect one of these:

- **Verification code** (email, SMS or authenticator) or **approval in the LinkedIn app**: the Add Account dialog asks for the code and finishes the sign-in. The browser is held open for 10 minutes; the request that submits the code must reach the same server process (fine for the single-process deployment, needs sticky routing if you run several instances).
- **CAPTCHA**: Reachly does not solve CAPTCHAs. Sign in at linkedin.com yourself and connect with session cookies.
- **No sign-in form** (`LOGIN_FORM_NOT_FOUND` in logs): LinkedIn distrusts the address. Add a residential proxy to the account (below) or use session cookies.

Sessions refreshed unattended by a worker cannot answer a verification step: the account is flagged and its campaigns pause until someone reconnects it. The verification-page selectors are best-effort and have not been verified against a live LinkedIn account.

## Proxies (one per LinkedIn account)

LinkedIn ties a session to where it is used. Cookies created on a laptop in India and replayed from a datacenter IP are often rejected, which shows up as `SESSION_EXPIRED` (a redirect loop) on the first profile visit. Give each LinkedIn account its own proxy so LinkedIn always sees it from the same place:

- **Type:** residential or mobile (ISP) proxy. Datacenter proxies are rejected the same way the server's own IP is.
- **Location:** the country (ideally the city) the account owner normally logs in from.
- **Sticky IP:** use the provider's sticky / static session option. A rotating IP looks like the account teleporting.
- **One account per proxy.** Sharing one IP across many accounts links them.

Set it in **LinkedIn Accounts → Add Account → Proxy**, or **Edit** on an existing account. Accepted formats: `http://user:pass@host:port`, `host:port`, `host:port:user:pass`. SOCKS5 works only without a username (Chromium limitation). Reachly opens a test tunnel to LinkedIn when the proxy is saved and names a wrong password or dead proxy immediately. Credentials are stored AES-256-GCM encrypted and never returned by the API.

`LINKEDIN_PROXY_URL` is a fallback for accounts with no proxy of their own (fine for a single-account deployment; do not share it across many accounts).

The browser's timezone follows the account. It is taken from the workspace timezone when the account is connected or reconnected, so set the workspace timezone to match the proxy country first.

After adding or changing a proxy, **paste fresh session cookies**: sign in to LinkedIn again, ideally while your own browser uses the same proxy, so the session is created and used from one location.

A proxy outage is reported as `PROXY_FAILED`; leads stay pending and are retried rather than skipped.

## Verify locally

```bash
npm run services:up
npm test
npm run build
npm run dev
curl http://localhost:3000/api/health
```

Sign up, connect a LinkedIn account (test account), import leads, launch a campaign, and confirm jobs in Redis (`redis-cli KEYS 'bull:*'`).
