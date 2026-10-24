-- Campaign execution: enrollments, scheduled jobs, execution attempts (no external LinkedIn actions)

-- ---------------------------------------------------------------------------
-- Extend campaign lifecycle statuses (preserve existing values)
-- ---------------------------------------------------------------------------

alter table public.campaigns drop constraint if exists campaigns_status_check;

alter table public.campaigns
  add constraint campaigns_status_check
  check (status in (
    'draft', 'active', 'paused', 'archived',
    'completed', 'cancelled', 'failed'
  ));

-- Composite FK targets for execution tables
alter table public.campaign_steps
  add constraint campaign_steps_id_workspace_uidx unique (id, workspace_id);

-- ---------------------------------------------------------------------------
-- Enrollments
-- ---------------------------------------------------------------------------

create table public.campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null,
  lead_id uuid not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'cancelled', 'failed')),
  current_step_id uuid,
  current_step_order int check (current_step_order is null or current_step_order > 0),
  next_run_at timestamptz,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint campaign_enrollments_campaign_workspace_fk
    foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id)
    on delete cascade,
  constraint campaign_enrollments_lead_workspace_fk
    foreign key (lead_id, workspace_id)
    references public.leads (id, workspace_id)
    on delete cascade,
  constraint campaign_enrollments_step_workspace_fk
    foreign key (current_step_id, workspace_id)
    references public.campaign_steps (id, workspace_id)
    on delete set null
);

create unique index campaign_enrollments_active_lead_uidx
  on public.campaign_enrollments (campaign_id, lead_id)
  where status in ('active', 'paused');

create index campaign_enrollments_workspace_campaign_idx
  on public.campaign_enrollments (workspace_id, campaign_id);
create index campaign_enrollments_next_run_idx
  on public.campaign_enrollments (workspace_id, next_run_at)
  where status = 'active' and next_run_at is not null;

-- ---------------------------------------------------------------------------
-- Scheduled jobs
-- ---------------------------------------------------------------------------

create table public.campaign_execution_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  enrollment_id uuid not null,
  campaign_id uuid not null,
  campaign_step_id uuid not null,
  status text not null default 'pending'
    check (status in (
      'pending', 'claimed', 'running', 'completed',
      'failed', 'cancelled', 'skipped', 'blocked'
    )),
  scheduled_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by text,
  attempt_count int not null default 0 check (attempt_count >= 0),
  max_attempts int not null default 3 check (max_attempts > 0 and max_attempts <= 10),
  next_retry_at timestamptz,
  idempotency_key text not null,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, idempotency_key),
  unique (enrollment_id, campaign_step_id),
  constraint campaign_execution_jobs_enrollment_workspace_fk
    foreign key (enrollment_id, workspace_id)
    references public.campaign_enrollments (id, workspace_id)
    on delete cascade,
  constraint campaign_execution_jobs_campaign_workspace_fk
    foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id)
    on delete cascade,
  constraint campaign_execution_jobs_step_workspace_fk
    foreign key (campaign_step_id, workspace_id)
    references public.campaign_steps (id, workspace_id)
    on delete cascade
);

create index campaign_execution_jobs_due_idx
  on public.campaign_execution_jobs (workspace_id, scheduled_at)
  where status in ('pending', 'claimed');
create index campaign_execution_jobs_campaign_status_idx
  on public.campaign_execution_jobs (campaign_id, status);

-- ---------------------------------------------------------------------------
-- Execution attempts
-- ---------------------------------------------------------------------------

create table public.campaign_execution_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  job_id uuid not null,
  attempt_number int not null check (attempt_number > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null
    check (outcome in ('success', 'retryable_failure', 'permanent_failure', 'unsupported')),
  error_code text,
  error_message text,
  executor_type text not null,
  created_at timestamptz not null default now(),
  constraint campaign_execution_attempts_job_workspace_fk
    foreign key (job_id, workspace_id)
    references public.campaign_execution_jobs (id, workspace_id)
    on delete cascade,
  unique (job_id, attempt_number)
);

create index campaign_execution_attempts_job_idx
  on public.campaign_execution_attempts (job_id, attempt_number);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger campaign_enrollments_set_updated_at
  before update on public.campaign_enrollments
  for each row execute function public.set_updated_at();

create trigger campaign_execution_jobs_set_updated_at
  before update on public.campaign_execution_jobs
  for each row execute function public.set_updated_at();

create or replace function public.enforce_campaign_execution_job_workspace()
returns trigger
language plpgsql
as $$
declare
  enr_ws uuid;
  enr_campaign uuid;
  step_campaign uuid;
begin
  select e.workspace_id, e.campaign_id into enr_ws, enr_campaign
  from public.campaign_enrollments e
  where e.id = new.enrollment_id;

  if enr_ws is null then
    raise exception 'invalid_enrollment';
  end if;

  if new.workspace_id is distinct from enr_ws then
    raise exception 'job_workspace_mismatch';
  end if;

  if new.campaign_id is distinct from enr_campaign then
    raise exception 'job_campaign_mismatch';
  end if;

  select cs.campaign_id into step_campaign
  from public.campaign_steps cs
  where cs.id = new.campaign_step_id and cs.workspace_id = new.workspace_id;

  if step_campaign is null or step_campaign is distinct from new.campaign_id then
    raise exception 'job_step_mismatch';
  end if;

  return new;
end;
$$;

create trigger campaign_execution_jobs_enforce_workspace
  before insert or update on public.campaign_execution_jobs
  for each row execute function public.enforce_campaign_execution_job_workspace();

-- ---------------------------------------------------------------------------
-- Atomic job claiming (FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------

create or replace function public.claim_due_campaign_jobs(
  p_worker_id text,
  p_limit int default 10
)
returns setof public.campaign_execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_worker_id is null or char_length(trim(p_worker_id)) < 1 then
    raise exception 'invalid_worker_id';
  end if;

  return query
  with due as (
    select j.id
    from public.campaign_execution_jobs j
    inner join public.campaigns c on c.id = j.campaign_id and c.workspace_id = j.workspace_id
    where j.status = 'pending'
      and j.scheduled_at <= now()
      and (j.next_retry_at is null or j.next_retry_at <= now())
      and c.status = 'active'
      and public.is_workspace_member(j.workspace_id)
    order by j.scheduled_at asc
    limit lim
    for update of j skip locked
  )
  update public.campaign_execution_jobs j
  set
    status = 'claimed',
    claimed_at = now(),
    claimed_by = trim(p_worker_id),
    updated_at = now()
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

revoke all on function public.claim_due_campaign_jobs(text, int) from public;
grant execute on function public.claim_due_campaign_jobs(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.campaign_enrollments enable row level security;
alter table public.campaign_execution_jobs enable row level security;
alter table public.campaign_execution_attempts enable row level security;

create policy campaign_enrollments_select on public.campaign_enrollments
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy campaign_enrollments_insert on public.campaign_enrollments
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.workspace_id = campaign_enrollments.workspace_id
    )
  );

create policy campaign_enrollments_update on public.campaign_enrollments
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy campaign_enrollments_delete on public.campaign_enrollments
  for delete to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

create policy campaign_execution_jobs_select on public.campaign_execution_jobs
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy campaign_execution_jobs_insert on public.campaign_execution_jobs
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy campaign_execution_jobs_update on public.campaign_execution_jobs
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy campaign_execution_jobs_delete on public.campaign_execution_jobs
  for delete to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

create policy campaign_execution_attempts_select on public.campaign_execution_attempts
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy campaign_execution_attempts_insert on public.campaign_execution_attempts
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

create policy campaign_execution_attempts_delete on public.campaign_execution_attempts
  for delete to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));
