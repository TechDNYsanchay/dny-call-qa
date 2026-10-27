-- One coaching focus per person at a time, set by a founder, manager or admin: a call-sheet
-- question to ask on every call, or a scorecard area to get to Met. Progress is worked out from
-- the scored calls; ending a focus keeps it for history.
create table coaching_focus (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  kind text not null check (kind in ('question', 'area')),
  target_id text not null,
  note text,
  set_by uuid references people (id),
  set_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index coaching_focus_one_active on coaching_focus (person_id) where ended_at is null;
alter table coaching_focus enable row level security;
create policy focus_read on coaching_focus for select to authenticated
  using (can_see_all() or person_id = current_person_id());
-- Set and ended by the server after checking the person's role.
