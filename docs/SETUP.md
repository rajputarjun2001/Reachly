# Reachly — Setup

## Prerequisites

- Node.js 22.12+
- npm
- Docker Desktop (used for local MongoDB and Redis)

## 1. Install dependencies

```bash
cd Reachly
npm install
```

## 2. Environment variables

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `3000`) |
| `NEXT_PUBLIC_SITE_URL` | Public origin of the app |
| `MONGO_URI` | MongoDB connection string |
| `REDIS_HOST` / `REDIS_PORT` | BullMQ connection |
| `JWT_SECRET` | Session signing key, at least 32 characters |
| `ENCRYPTION_KEY` | 64 hex characters (32 bytes) for LinkedIn password and cookie encryption |
| `WORKERS_ENABLED` | `true` to run queues in this process |
| `DOCKER_ENABLED` | `true` to isolate each LinkedIn account in its own browser container |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one value for `JWT_SECRET` and a **different** value for `ENCRYPTION_KEY`.

Never commit `.env`. There is no service-role key and no Supabase project.

If the required variables are missing, the UI still starts in demo mode. Visit `/setup` for the current status.

## 3. Start MongoDB and Redis

```bash
npm run services:up
```

This runs `docker compose` with MongoDB on port 27017 and Redis on port 6379. Data is stored in named Docker volumes.

```bash
npm run services:down
```

## 4. Playwright (needed to connect a LinkedIn account)

```bash
npm run browsers:install
```

Set `DOCKER_ENABLED=true` only if you also want a dedicated browser container per account. That is optional; the default is a local headless Chromium.

## 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000. Sign up at `/signup` — that creates the first user **and** a workspace. The same process serves `/api/health` and the rest of the REST API.

## 6. Tests

```bash
npm test
npm run typecheck
```

Server tests use an in-memory MongoDB. They do not need Docker or Redis.
