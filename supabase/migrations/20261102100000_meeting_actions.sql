-- The next steps agreed on a vision call (from its recap), so they can be ticked off, show on the
-- follow-up list and go into the emails. The scoring pipeline writes them; people tick them off
-- through the app, which checks who may (the consultant on the call, or a founder) before writing.
create table meeting_actions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls (id) on delete cascade,
  lead_id uuid references leads (id) on delete set null,
  position integer not null,
  owner text not null check (owner in ('dny', 'client')),
  kind text not null check (kind in ('proposal', 'review_call', 'other')),
  task text not null,
  due_date date,
  due_text text,
  quote text,
  quote_at text,
  done_at timestamptz,
  done_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (call_id, position)
);

create index meeting_actions_open on meeting_actions (due_date) where done_at is null;

alter table meeting_actions enable row level security;

create policy actions_read on meeting_actions for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and (can_see_all() or c.person_id = current_person_id())));
