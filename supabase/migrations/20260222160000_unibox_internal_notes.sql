-- Unibox internal notes and drafts (workspace-only; never sent externally)

create table public.unibox_internal_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid,
  lead_id uuid,
  kind text not null default 'note' check (kind in ('note', 'draft')),
  body text not null check (char_length(trim(body)) >= 1 and char_length(body) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint unibox_internal_notes_parent_chk
    check (conversation_id is not null or lead_id is not null),
  constraint unibox_internal_notes_conversation_workspace_fk
    foreign key (conversation_id, workspace_id)
    references public.conversations (id, workspace_id)
    on delete cascade,
  constraint unibox_internal_notes_lead_workspace_fk
    foreign key (lead_id, workspace_id)
    references public.leads (id, workspace_id)
    on delete cascade
);

create index unibox_internal_notes_workspace_idx on public.unibox_internal_notes (workspace_id);
create index unibox_internal_notes_conversation_idx
  on public.unibox_internal_notes (conversation_id, updated_at desc);
create index unibox_internal_notes_lead_idx
  on public.unibox_internal_notes (lead_id, updated_at desc)
  where lead_id is not null;

create trigger unibox_internal_notes_set_updated_at
  before update on public.unibox_internal_notes
  for each row execute function public.set_updated_at();

create or replace function public.enforce_unibox_internal_note_parents()
returns trigger
language plpgsql
as $$
declare
  conv_ws uuid;
  conv_lead uuid;
begin
  if new.conversation_id is not null then
    select c.workspace_id, c.lead_id into conv_ws, conv_lead
    from public.conversations c
    where c.id = new.conversation_id;

    if conv_ws is null then
      raise exception 'invalid_conversation';
    end if;

    if new.workspace_id is distinct from conv_ws then
      raise exception 'note_workspace_mismatch';
    end if;

    if new.lead_id is not null and conv_lead is not null and new.lead_id is distinct from conv_lead then
      raise exception 'note_lead_conversation_mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger unibox_internal_notes_enforce_parents
  before insert or update on public.unibox_internal_notes
  for each row execute function public.enforce_unibox_internal_note_parents();

alter table public.unibox_internal_notes enable row level security;

create policy unibox_internal_notes_select on public.unibox_internal_notes
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy unibox_internal_notes_insert on public.unibox_internal_notes
  for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (
      conversation_id is null
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.workspace_id = unibox_internal_notes.workspace_id
      )
    )
    and (
      lead_id is null
      or exists (
        select 1 from public.leads l
        where l.id = lead_id and l.workspace_id = unibox_internal_notes.workspace_id
      )
    )
  );

create policy unibox_internal_notes_update on public.unibox_internal_notes
  for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy unibox_internal_notes_delete on public.unibox_internal_notes
  for delete to authenticated
  using (public.is_workspace_member(workspace_id));
