-- Unibox: workspace-scoped conversations and messages (persistence only — no external sync)

-- Composite FK target: leads(id, workspace_id) must be unique (id alone is only the PK).
alter table public.leads
  add constraint leads_id_workspace_uidx unique (id, workspace_id);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid,
  title text not null check (char_length(trim(title)) >= 1),
  status text not null default 'open' check (status in ('open', 'archived')),
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint conversations_lead_workspace_fk
    foreign key (lead_id, workspace_id)
    references public.leads (id, workspace_id)
    on delete set null
);

create index conversations_workspace_id_idx on public.conversations (workspace_id);
create index conversations_workspace_last_msg_idx
  on public.conversations (workspace_id, last_message_at desc nulls last);
create index conversations_workspace_status_idx on public.conversations (workspace_id, status);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  workspace_id uuid not null,
  direction text not null check (direction in ('outbound', 'inbound', 'system')),
  body text not null check (char_length(trim(body)) >= 1 and char_length(body) <= 8000),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint messages_conversation_workspace_fk
    foreign key (conversation_id, workspace_id)
    references public.conversations (id, workspace_id)
    on delete cascade
);

create index messages_conversation_id_idx on public.messages (conversation_id, sent_at asc);
create index messages_workspace_id_idx on public.messages (workspace_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create or replace function public.enforce_message_workspace_from_conversation()
returns trigger
language plpgsql
as $$
declare
  conv_ws uuid;
begin
  select c.workspace_id into conv_ws
  from public.conversations c
  where c.id = new.conversation_id;

  if conv_ws is null then
    raise exception 'invalid_conversation';
  end if;

  if new.workspace_id is distinct from conv_ws then
    raise exception 'message_workspace_mismatch';
  end if;

  return new;
end;
$$;

create trigger messages_enforce_conversation_workspace
  before insert or update on public.messages
  for each row execute function public.enforce_message_workspace_from_conversation();

create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations c
  set
    last_message_at = new.sent_at,
    last_message_preview = left(trim(new.body), 200)
  where c.id = new.conversation_id
    and c.workspace_id = new.workspace_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (
      lead_id is null
      or exists (
        select 1 from public.leads l
        where l.id = lead_id and l.workspace_id = conversations.workspace_id
      )
    )
  );

create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and (
      lead_id is null
      or exists (
        select 1 from public.leads l
        where l.id = lead_id and l.workspace_id = conversations.workspace_id
      )
    )
  );

create policy conversations_delete on public.conversations
  for delete to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.workspace_id = messages.workspace_id
    )
  );

create policy messages_update on public.messages
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy messages_delete on public.messages
  for delete to authenticated
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));
