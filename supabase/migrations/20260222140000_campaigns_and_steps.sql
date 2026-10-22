-- Campaigns and sequence steps (workspace-isolated, configuration only — no execution)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 1),
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  lead_list_id uuid,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint campaigns_lead_list_workspace_fk
    foreign key (lead_list_id, workspace_id)
    references public.lead_lists (id, workspace_id)
    on delete set null
);

create index campaigns_workspace_id_idx on public.campaigns (workspace_id);
create index campaigns_workspace_status_idx on public.campaigns (workspace_id, status);
create index campaigns_created_at_idx on public.campaigns (workspace_id, created_at desc);

create table public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  workspace_id uuid not null,
  step_order int not null check (step_order > 0),
  step_type text not null
    check (step_type in ('connection_request', 'message')),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_steps_campaign_workspace_fk
    foreign key (campaign_id, workspace_id)
    references public.campaigns (id, workspace_id)
    on delete cascade,
  unique (campaign_id, step_order)
);

create index campaign_steps_campaign_id_idx on public.campaign_steps (campaign_id);
create index campaign_steps_workspace_id_idx on public.campaign_steps (workspace_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

create trigger campaign_steps_set_updated_at
  before update on public.campaign_steps
  for each row execute function public.set_updated_at();

create or replace function public.enforce_campaign_step_workspace()
returns trigger
language plpgsql
as $$
declare
  camp_ws uuid;
begin
  select c.workspace_id into camp_ws
  from public.campaigns c
  where c.id = new.campaign_id;

  if camp_ws is null then
    raise exception 'invalid_campaign';
  end if;

  if new.workspace_id is distinct from camp_ws then
    raise exception 'campaign_step_workspace_mismatch';
  end if;

  return new;
end;
$$;

create trigger campaign_steps_enforce_workspace
  before insert or update on public.campaign_steps
  for each row execute function public.enforce_campaign_step_workspace();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.campaigns enable row level security;
alter table public.campaign_steps enable row level security;

create policy campaigns_select on public.campaigns
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy campaigns_insert on public.campaigns
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
    and (
      lead_list_id is null
      or exists (
        select 1 from public.lead_lists ll
        where ll.id = lead_list_id and ll.workspace_id = campaigns.workspace_id
      )
    )
  );

create policy campaigns_update on public.campaigns
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and (
      lead_list_id is null
      or exists (
        select 1 from public.lead_lists ll
        where ll.id = lead_list_id and ll.workspace_id = campaigns.workspace_id
      )
    )
  );

create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

create policy campaign_steps_select on public.campaign_steps
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy campaign_steps_insert on public.campaign_steps
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.workspace_id = campaign_steps.workspace_id
    )
  );

create policy campaign_steps_update on public.campaign_steps
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.workspace_id = campaign_steps.workspace_id
    )
  );

create policy campaign_steps_delete on public.campaign_steps
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));
