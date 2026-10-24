# Campaign execution engine (Task 010)

Reachly stores campaign **configuration** in `campaigns` / `campaign_steps` and runs a **durable execution layer** in:

- `campaign_enrollments` — per-lead progress in a campaign
- `campaign_execution_jobs` — scheduled work units (one row per enrollment × step)
- `campaign_execution_attempts` — append-only execution history

Migration: `supabase/migrations/20260222170000_campaign_execution.sql`

## LinkedIn / external delivery

**No live LinkedIn actions** are performed in this release. The default server executor (`disabledCampaignExecutor`) returns `unsupported` for every job. Jobs transition to **`blocked`** — they are **not** recorded as successful sends.

Enable a real provider only when `CAMPAIGN_EXECUTOR_ENABLED=true` and a vetted executor implementation exists.

Optional test mock: `CAMPAIGN_EXECUTOR_MOCK=true` (never use in production).

## Campaign statuses

Extended set: `draft`, `active`, `paused`, `archived`, `completed`, `cancelled`, `failed`.

A campaign moves to **`completed`** only when there are **no pending or running jobs** and no **active** enrollments (see `tryFinalizeCampaign`).

## Worker / cron integration

Due jobs are claimed atomically via RPC:

```sql
select * from public.claim_due_campaign_jobs('worker-name', 25);
```

- Uses `FOR UPDATE SKIP LOCKED` to avoid double-claim under concurrent workers.
- Requires an authenticated Supabase session with workspace membership (RLS).
- Production workers should run with a service role **only** if you add a separate hardened RPC; document ops before doing so.

Suggested cron flow:

1. `claim_due_campaign_jobs`
2. For each row, call application `executeCampaignJob(jobId)` (records attempt, applies retry policy)
3. `tryFinalizeCampaign` for affected campaigns

Server action `processDueCampaignJobsAction` wraps claim + execute for manual/ops use.

## Retry policy

- Default `max_attempts`: 3
- Backoff: 1 min, 5 min, 15 min (`RETRY_BACKOFF_MS`)
- Retryable failures return job to `pending` with `next_retry_at`
- Permanent failures or exhausted retries → job `failed`, enrollment `failed`

## Manual setup

Apply migration locally or on your Supabase project:

```bash
supabase db push
```

RLS integration tests (`supabase db test`) were **not** executed unless you run them against a live local database.
