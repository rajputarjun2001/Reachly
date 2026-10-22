-- Reachly: profiles, workspaces, workspace_members + RLS

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 1),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index workspaces_created_by_idx on public.workspaces (created_by);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile on signup (idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Slug helper
-- ---------------------------------------------------------------------------

create or replace function public.slugify_workspace_name(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, 'workspace')), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap: create initial workspace (idempotent per user)
-- ---------------------------------------------------------------------------

create or replace function public.create_initial_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing uuid;
  ws_id uuid;
  base_slug text;
  final_slug text;
  suffix int := 0;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select wm.workspace_id into existing
  from public.workspace_members wm
  where wm.user_id = uid
  limit 1;

  if existing is not null then
    return existing;
  end if;

  if workspace_name is null or char_length(trim(workspace_name)) < 1 then
    raise exception 'invalid_workspace_name';
  end if;

  base_slug := public.slugify_workspace_name(workspace_name);
  if base_slug = '' then
    base_slug := 'workspace';
  end if;
  final_slug := base_slug;

  while exists (select 1 from public.workspaces w where w.slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := base_slug || '-' || suffix::text;
  end loop;

  insert into public.workspaces (name, slug, created_by)
  values (trim(workspace_name), final_slug, uid)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, uid, 'owner');

  return ws_id;
end;
$$;

revoke all on function public.create_initial_workspace(text) from public;
grant execute on function public.create_initial_workspace(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS helpers (avoid policy recursion on workspace_members)
-- ---------------------------------------------------------------------------

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.workspace_role(uuid) from public;
grant execute on function public.workspace_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Profiles: own row only
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Workspaces: members can read
create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

create policy workspaces_update_admin on public.workspaces
  for update to authenticated
  using (public.workspace_role(id) in ('owner', 'admin'))
  with check (public.workspace_role(id) in ('owner', 'admin'));

-- No direct workspace INSERT for clients (use create_initial_workspace)

-- Workspace members: read co-members in shared workspaces
create policy workspace_members_select_shared on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy workspace_members_update_admin on public.workspace_members
  for update to authenticated
  using (
    public.workspace_role(workspace_id) in ('owner', 'admin')
    and user_id <> auth.uid()
  )
  with check (
    role in ('admin', 'member')
    or (role = 'owner' and public.workspace_role(workspace_id) = 'owner')
  );

-- No INSERT/DELETE on workspace_members for authenticated (bootstrap via definer RPC only)
