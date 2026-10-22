-- Lead lists and leads (workspace-isolated)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.lead_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 1),
  description text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create index lead_lists_workspace_id_idx on public.lead_lists (workspace_id);
create index lead_lists_created_at_idx on public.lead_lists (workspace_id, created_at desc);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_list_id uuid,
  first_name text,
  last_name text,
  email text,
  company text,
  job_title text,
  linkedin_url text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_lead_list_workspace_fk
    foreign key (lead_list_id, workspace_id)
    references public.lead_lists (id, workspace_id)
    on delete set null,
  constraint leads_email_format_chk check (
    email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  )
);

create index leads_workspace_id_idx on public.leads (workspace_id);
create index leads_lead_list_id_idx on public.leads (lead_list_id);
create index leads_workspace_created_idx on public.leads (workspace_id, created_at desc);

create unique index leads_workspace_linkedin_url_uidx
  on public.leads (workspace_id, lower(linkedin_url))
  where linkedin_url is not null and char_length(trim(linkedin_url)) > 0;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger lead_lists_set_updated_at
  before update on public.lead_lists
  for each row execute function public.set_updated_at();

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

create or replace function public.enforce_lead_workspace_from_list()
returns trigger
language plpgsql
as $$
declare
  list_ws uuid;
begin
  if new.lead_list_id is not null then
    select ll.workspace_id into list_ws
    from public.lead_lists ll
    where ll.id = new.lead_list_id;

    if list_ws is null then
      raise exception 'invalid_lead_list';
    end if;

    if new.workspace_id is distinct from list_ws then
      raise exception 'lead_list_workspace_mismatch';
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_enforce_list_workspace
  before insert or update on public.leads
  for each row execute function public.enforce_lead_workspace_from_list();

-- ---------------------------------------------------------------------------
-- Import RPC (transactional per call)
-- ---------------------------------------------------------------------------

create or replace function public.import_leads_to_list(
  p_lead_list_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws_id uuid;
  row jsonb;
  inserted int := 0;
  skipped int := 0;
  invalid int := 0;
  v_linkedin text;
  v_email text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select ll.workspace_id into ws_id
  from public.lead_lists ll
  where ll.id = p_lead_list_id;

  if ws_id is null or not public.is_workspace_member(ws_id) then
    raise exception 'forbidden';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_rows';
  end if;

  for row in select * from jsonb_array_elements(p_rows)
  loop
    v_linkedin := nullif(trim(row ->> 'linkedin_url'), '');
    v_email := nullif(lower(trim(row ->> 'email')), '');

    if v_linkedin is null then
      invalid := invalid + 1;
      continue;
    end if;

    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      invalid := invalid + 1;
      continue;
    end if;

    if exists (
      select 1 from public.leads l
      where l.workspace_id = ws_id
        and l.linkedin_url is not null
        and lower(l.linkedin_url) = lower(v_linkedin)
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    begin
      insert into public.leads (
        workspace_id,
        lead_list_id,
        first_name,
        last_name,
        email,
        company,
        job_title,
        linkedin_url,
        source
      ) values (
        ws_id,
        p_lead_list_id,
        nullif(trim(row ->> 'first_name'), ''),
        nullif(trim(row ->> 'last_name'), ''),
        v_email,
        nullif(trim(row ->> 'company'), ''),
        coalesce(nullif(trim(row ->> 'job_title'), ''), nullif(trim(row ->> 'title'), '')),
        v_linkedin,
        coalesce(nullif(trim(row ->> 'source'), ''), 'csv_import')
      );
      inserted := inserted + 1;
    exception
      when unique_violation then
        skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'inserted', inserted,
    'skipped', skipped,
    'invalid', invalid
  );
end;
$$;

revoke all on function public.import_leads_to_list(uuid, jsonb) from public;
grant execute on function public.import_leads_to_list(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.lead_lists enable row level security;
alter table public.leads enable row level security;

create policy lead_lists_select on public.lead_lists
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy lead_lists_insert on public.lead_lists
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
  );

create policy lead_lists_update on public.lead_lists
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy lead_lists_delete on public.lead_lists
  for delete to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

create policy leads_select on public.leads
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy leads_insert on public.leads
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (
      lead_list_id is null
      or exists (
        select 1 from public.lead_lists ll
        where ll.id = lead_list_id and ll.workspace_id = leads.workspace_id
      )
    )
  );

create policy leads_update on public.leads
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and (
      lead_list_id is null
      or exists (
        select 1 from public.lead_lists ll
        where ll.id = lead_list_id and ll.workspace_id = leads.workspace_id
      )
    )
  );

create policy leads_delete on public.leads
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));
